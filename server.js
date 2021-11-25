
const express = require('express');
const app = express();
var EventEmitter = require('events').EventEmitter
var emitter = new EventEmitter();

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

const rooms = {};

const words = ['angel', 'angry', 'eyeball', 'pizza', 'book', 'giraffe', 'bible', 'cat', 'lion', 'stairs', 'tire', 'sun', 'camera', 'river'];

var current_word = {};

var round_number = {};

var game_on = {};

var current_player = {};

var roundInterval = {};

var timeInterval = {};

var time = {};

app.get('/', (req, res) => {
  res.render('index', { rooms: rooms });
});

app.post('/room', (req, res) => {
  if (rooms[req.body.room] != null) {
    return res.redirect('/');
  }
  rooms[req.body.room] = { users: {}, id: null, played: {}, vote: 0 };
  current_word[req.body.room] = null;
  round_number[req.body.room] = 1;
  game_on[req.body.room] = false;
  current_player[req.body.room] = null;
  roundInterval[req.body.room] = null;
  timeInterval[req.body.room] = null;
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
  rooms[req.body.room] = { users: {}, id: req.body.pass, played: {}};
  res.redirect(req.body.room);
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
    rooms[room].users[socket.id] = name;
    rooms[room].played[socket.id] = false;
    socket.to(room).emit('user-connected', name);
    if(game_on[room])
    {
        io.to(socket.id).emit('time', time[room]);
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
  
  // utkarsh's part
  socket.on('send-vote', (room , voter_name) => {
    rooms[room].vote++; // vote for each room would be made 0 after each round
    const num_players = Object.keys(rooms[room].users).length 
    let kicked_out = Boolean(rooms[room].vote == num_players-1)
    io.to(room).emit('votekick-message', voter_name , rooms[room].users[current_player[room]], rooms[room].vote, num_players, kicked_out)
    if(kicked_out){
      delete rooms[room].users[current_player[room]];
      delete rooms[room].played[current_player[room]];
      socket.to(current_player[room]).emit('redirect', '/');
      clearInterval(roundInterval[room]);
      roundFunc(room);
      clearInterval(timeInterval[room]);
      time[room] = 90;
      timeDec(room);
      timeInterval[room] = setInterval(timeDec, 1000, room);
      roundInterval[room] = setInterval(roundFunc, 90000, room);
    }
  });

  socket.on('drawing', (room, data) => {
    socket.to(room).emit('drawing-data', data)
  });
  socket.on('drawing-end', (room) => {
    socket.to(room).emit('drawing-end')
  });
  socket.on('start-game', (room) => {
    game_on[room] = true;
    clearInterval(roundInterval[room]);
    roundFunc(room);
    clearInterval(timeInterval[room]);
    time[room] = 90;
    timeDec(room);
    timeInterval[room] = setInterval(timeDec, 1000, room);
    roundInterval[room] = setInterval(roundFunc, 90000, room);
  });
  socket.on('word-length', (room, num) => {
    socket.to(room).emit('guess-length', num);
  });
  socket.on('disconnect', () => {
    getUserRooms(socket).forEach(room => {
      socket.to(room).emit('user-disconnected', rooms[room].users[socket.id]);
      delete rooms[room].users[socket.id];
      delete rooms[room].played[socket.id];
      if(game_on)
      {
          if(current_player[room] == socket.id)
          {
              clearInterval(roundInterval[room]);
              roundFunc(room);
              clearInterval(timeInterval[room]);
              time[room] = 90;
              timeDec(room);
              timeInterval[room] = setInterval(timeDec, 1000, room);
              roundInterval[room] = setInterval(roundFunc, 90000, room);
          }
      }
    })
  });
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
  if (getKeyByValue(rooms[room].played, false) === undefined)
  {
    round_number[room] = round_number[room] + 1;
    Object.keys(rooms[room].played).forEach(v => rooms[room].played[v] = false)
  }
  time[room] = 90;
  next = getKeyByValue(rooms[room].played, false);
  current_player[room] = next;
  rooms[room].played[next] = true;
  rooms[room].vote = 0;
  emitter.emit('start-round', room, next);
}

function getKeyByValue(object, value) {
  return Object.keys(object).find(key => object[key] === value);
}

function timeDec(room) {
  time[room] = time[room] - 1;
  io.to(room).emit('time', time[room]);
}
