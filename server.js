
const express = require('express');
const app = express();
const dotenv = require('dotenv');
dotenv.config();
var EventEmitter = require('events').EventEmitter
var emitter = new EventEmitter();

require('dotenv').config({ path: './.env'});
var randomWords = require('random-words');

// database part
const {Client} = require('pg')

const client = new Client({
    host: process.env.HOST,
    user: process.env.USER,
    port: process.env.PORT,
    password: process.env.PASSWORD,
    database: process.env.DATABASE
})

client.connect()
.then(() => console.log("Connected succesfully"))
.catch(e => console.log(e))

const server = require('http').Server(app);
const io = require('socket.io')(server, {
    cors: {
        origin: '*'
    }
});

app.set('views', './views');
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

const game_time = 90
const num_round = 3

const rooms = {};

const words = randomWords({ exactly: 5000 });

var current_word = {};

var round_number = {};

var game_on = {};

var current_player = {};

var roundInterval = {};

var timeInterval = {};

var time = {};

var guess_count = {};

app.get('/', (req, res) => {
  res.render('index', { rooms: rooms });
});

app.get('/leaderboard',(req,res) => {
  var query = "select * from scores";
  client.query(query,(err,result) =>{
    if(err)
        throw err;
    else {
        const scoreboard = result.rows;
        var sortable = [];
        for (var score in scoreboard)
        {
            sortable.push([score, scoreboard[score].scores])
        }
        sortable.sort(function(a, b) {
            return b[1] - a[1];
        });

        res.render('leaderboard.ejs', { scoreboard: result.rows , sortable: sortable });  
    }
  })
})

app.post('/room', (req, res) => {
  if (rooms[req.body.room] != null) {
    return res.redirect('/');
  }
  rooms[req.body.room] = { users: {}, id: null, played: {}, vote: 0 , scores: {}, total_scores: {}};
  current_word[req.body.room] = null;
  round_number[req.body.room] = 1;
  game_on[req.body.room] = false;
  current_player[req.body.room] = null;
  roundInterval[req.body.room] = null;
  timeInterval[req.body.room] = null;
  guess_count[req.body.room] = null;
  res.redirect(req.body.room);
  time[req.body.room] = 0;
  io.emit('room-created', req.body.room);
})

app.get('/private', (req, res) => {
  res.render('private.ejs', {});
});

app.post('/privateroom', (req, res) => {
  if (rooms[req.body.room] != null) {
    return res.redirect('/private');
  }
  rooms[req.body.room] = { users: {}, id: req.body.pass, played: {}, vote: 0, scores: {}, total_scores: {}};
  current_word[req.body.room] = null;
  round_number[req.body.room] = 1;
  game_on[req.body.room] = false;
  current_player[req.body.room] = null;
  roundInterval[req.body.room] = null;
  timeInterval[req.body.room] = null;
  guess_count[req.body.room] = null;
  res.redirect(req.body.room);
  time[req.body.room] = 0;
});

app.post('/joinprivate', (req, res) => {
  if (rooms[req.body.room] == null) {
    return res.redirect('/private');
  }
  return res.redirect(req.body.room);
});

app.get('/:room', (req, res) => {
  if (rooms[req.params.room] == null) {
    return res.redirect('/');
  }
  res.render('room', { roomName: req.params.room, roomPass: rooms[req.params.room].id });
});

server.listen(5500, () =>
console.log('Listening on port *:5500'));

io.on('connection', socket => {
  socket.on('new-user', (room,name) => {
    socket.join(room);
    rooms[room].scores[socket.id] = 0; // On connection scores are made 0
    rooms[room].total_scores[socket.id] = 0;
    rooms[room].users[socket.id] = name;
    rooms[room].played[socket.id] = false;
    socket.to(room).emit('user-connected', name);
    if(game_on[room])
    {
        io.to(socket.id).emit('disable-start-button');
        io.to(socket.id).emit('time', time[room]);
        io.to(room).emit('clear-score-board');
        io.to(room).emit('edit-score-board', rooms[room].total_scores, rooms[room].users);
        io.to(socket.id).emit('guess-length', current_word[room].length);
    }
  });
  socket.on('send-chat-message', (room, message, guessed) => {
    if(!guessed)
    {
      if(message == current_word[room])
      {
        io.to(socket.id).emit('correct-guess');
        socket.to(room).emit('made-guess', rooms[room].users[socket.id])
      }
      else
      {
        socket.to(room).emit('chat-message', { message: message, name: rooms[room].users[socket.id]}, guessed);
      }
    }
    else
    {
     socket.to(room).emit('chat-message', { message: message, name: rooms[room].users[socket.id]}, guessed);
    }
  });
  
  socket.on('send-vote', (room , voter_name) => {
    if(rooms[room] != null)
    {
    rooms[room].vote++; // vote for each room would be made 0 after each round
    const num_players = Object.keys(rooms[room].users).length 
    let kicked_out = Boolean(rooms[room].vote == num_players-1)
    io.to(room).emit('votekick-message', voter_name , rooms[room].users[current_player[room]], rooms[room].vote, num_players, kicked_out, current_player[room])
    if(kicked_out){
      delete rooms[room].users[current_player[room]];
      delete rooms[room].played[current_player[room]];
      delete rooms[room].scores[current_player[room]];
      delete rooms[room].total_scores[current_player[room]];
      socket.to(current_player[room]).emit('kick-out');
      socket.to(current_player[room]).emit('redirect', '/');
      clearInterval(roundInterval[room]);
      roundFunc(room);
      clearInterval(timeInterval[room]);
      time[room] = game_time;
      timeDec(room);
      rooms[room].vote = 0;
      timeInterval[room] = setInterval(timeDec, 1000, room);
      roundInterval[room] = setInterval(roundFunc, game_time*1000, room);
      }
    }
  });

  // 90-75 ==> 1200
  // 75-60 ==> 1000
  // 60-45 ==> 800
  // 45-30 ==> 600
  // 30-15 ==> 400
  // 15-00 ==> 200
  // score of current_player
  socket.on('update-score', (room)=> {   
    // Updating guess count also
    rooms[room].scores[socket.id] = (Math.floor(time[room]/15)+1)*200
    rooms[room].total_scores[socket.id] += rooms[room].scores[socket.id]
    guess_count[room]++;
    if(guess_count[room] == Object.keys(rooms[room].users).length -1){

      rooms[room].scores[current_player[room]] = 1200;
      rooms[room].total_scores[current_player[room]] += rooms[room].scores[current_player[room]];
      clearInterval(roundInterval[room]);
      roundFunc(room); // Start new round
      clearInterval(timeInterval[room]);
      time[room] = game_time;
      timeDec(room);
      timeInterval[room] = setInterval(timeDec, 1000, room);
      roundInterval[room] = setInterval(roundFunc, game_time*1000, room);
    }
  });

  socket.on('initialize-score' ,(room) =>{
    if(rooms[room] != undefined)
    rooms[room].scores[socket.id] = 0
  })

  socket.on('drawing', (room, data) => {
    socket.to(room).emit('drawing-data', data)
  });
  socket.on('drawing-end', (room) => {
    socket.to(room).emit('drawing-end')
  });
  socket.on('start-game', (room) => {
    guess_count[room] = 0;
    game_on[room] = true;
    socket.to(room).emit('disable-start-button');
    clearInterval(roundInterval[room]);
    roundFunc(room);
    clearInterval(timeInterval[room]);
    time[room] = game_time;
    timeDec(room);
    timeInterval[room] = setInterval(timeDec, 1000, room);
    roundInterval[room] = setInterval(roundFunc, game_time*1000, room);
  });
  socket.on('word-length', (room, num) => {
    socket.to(room).emit('guess-length', num);
  });
  socket.on('peer-id', (room, id) =>{
  socket.to(room).emit('peer-connected', id);
  socket.on('disconnect', () => {
    getUserRooms(socket).forEach(room => {
      socket.to(room).emit('peer-disconnect', id);
      socket.to(room).emit('user-disconnected', rooms[room].users[socket.id]);
      delete rooms[room].users[socket.id];
      delete rooms[room].played[socket.id];
      delete rooms[room].scores[socket.id];
      delete rooms[room].total_scores[socket.id];
      if(Object.keys(rooms[room].users).length === 0)
      {
          clearInterval(roundInterval[room]);
          clearInterval(timeInterval[room]);
          delete current_word[room];
          delete round_number[room];
          delete current_player[room];
          delete guess_count[room];
          delete roundInterval[room];
          delete timeInterval[room];
          delete rooms[room];
      }
      if(game_on[room])
      {
          if(current_player[room] == socket.id)
          {
              clearInterval(roundInterval[room]);
              roundFunc(room);
              clearInterval(timeInterval[room]);
              time[room] = game_time;
              timeDec(room);
              timeInterval[room] = setInterval(timeDec, 1000, room);
              roundInterval[room] = setInterval(roundFunc, game_time*1000, room);
          }
          else
          {
              if(rooms[room] != undefined)
              {
              io.to(room).emit('clear-score-board');
              io.to(room).emit('edit-score-board', rooms[room].total_scores, rooms[room].users);
              }
          }
      }
    })
  });
  })
})

emitter.on('start-round', (room, next) => {
    var keys = Object.keys(words);
    current_word[room] = words[keys[Math.floor(keys.length * Math.random())]];
    io.to(next).emit('round-begin', current_word[room], room);
  });

function getUserRooms(socket) {
  return Object.entries(rooms).reduce((names, [name, room]) => {
    if (room.users[socket.id] != null) names.push(name)
    return names;
  }, []);
}

function roundFunc(room) {
  if(rooms[room] != undefined)
  {
  if (getKeyByValue(rooms[room].played, false) === undefined)
  {
    round_number[room] = round_number[room] + 1;
    Object.keys(rooms[room].played).forEach(v => rooms[room].played[v] = false)
    if( round_number[room] == num_round+1 ){
      

      for([key,val] of Object.entries(rooms[room].users)){
        client.query("INSERT INTO public.scores(users, scores, num_games) VALUES ($1,$2,$3)", [val,rooms[room].total_scores[key],1])        
      }
      io.to(room).emit('display-scores', rooms[room].scores, rooms[room].users, 'Round Scores\n')
      io.to(room).emit('display-scores', rooms[room].total_scores, rooms[room].users, 'Final Scores\n')
      io.to(room).emit('redirect','/leaderboard')
      game_on[room] = false;
      clearInterval(roundInterval[room])
      clearInterval(timeInterval[room])
      delete current_word[room];
      delete round_number[room];
      delete current_player[room];
      delete guess_count[room];
      delete roundInterval[room];
      delete timeInterval[room];
      delete rooms[room]
      return;
    }
  }
  time[room] = game_time;
  next = getKeyByValue(rooms[room].played, false);
  rooms[room].played[next] = true;
  rooms[room].vote = 0;


  const num_palyer = Object.keys(rooms[room].users).length 
  if(Boolean(guess_count[room] != num_palyer-1)){
    rooms[room].scores[current_player[room]] = Math.floor((guess_count[room]/(num_palyer-1))*1200); // fraction of correct guess * total points
    rooms[room].total_scores[current_player[room]] += rooms[room].scores[current_player[room]];
  }
  guess_count[room] = 0;
  current_player[room] = next;
  io.to(room).emit('clear-score-board');
  io.to(room).emit('edit-score-board', rooms[room].total_scores, rooms[room].users);
  io.to(room).emit('display-scores', rooms[room].scores , rooms[room].users, 'Round Scores\n');
  emitter.emit('start-round', room, next);
  }
}

function getKeyByValue(object, value) {
  return Object.keys(object).find(key => object[key] === value);
}

function timeDec(room) {
  if(time[room] != undefined)
  {
  time[room] = time[room] - 1;
  io.to(room).emit('time', time[room]);
  }
}
