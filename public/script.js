const socket = io('http://localhost:5500')
const messageContainer = document.getElementById('message-container')
const messageForm = document.getElementById('send-container')
const startForm = document.getElementById('start-button-container')
const messageInput = document.getElementById('message-input')
const room_container = document.getElementById('room-container')
const word_container = document.getElementById('word-container')
const votekick_container = document.getElementById('votekick-container')
const time_container = document.getElementById('time-container')
const votekick_button = document.getElementById('votekick-button')
const start_button = document.getElementById('start-button')
const score_container = document.getElementById('score-container')
const videoGrid = document.getElementById('video-grid')

var canvas = document.getElementById("canvas");
var ctx = canvas.getContext("2d");
var guessed = false;
const peers = {}

if (messageForm != null){
    if (roomPass != ''){
        const pass = prompt('Enter The Password');
        if (pass != roomPass){
            location.href = "/";
        }
    }
    const name = prompt('What is your name?');
    const myPeer = new Peer(undefined, {
      host: '/',
      port: '3001'
    });
    const myVideo = document.createElement('video')
    myVideo.muted = true

    navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    }).then(stream => {
        addVideoStream(myVideo, stream)
        myPeer.on('call', call => {
        call.answer(stream)
        const video = document.createElement('video')
        call.on('stream', userVideoStream => {
          addVideoStream(video, userVideoStream)
        })
    })
    socket.on('peer-connected', userId => {
          connectToNewUser(userId, stream)
        })
    })
    myPeer.on('open', id => {
        socket.emit('peer-id', roomName, id);
    });

    appendMessage('You joined', "#90EE90");
    socket.emit('new-user', roomName, name);
    messageForm.addEventListener('submit', e => {
        e.preventDefault()
        const message = messageInput.value
        appendMessage(`You: ${  message}`, "#000000")
        socket.emit('send-chat-message', roomName, message, guessed)
        messageInput.value = ''
    });

    startForm.addEventListener('submit', e => {
        e.preventDefault()
        // console.log("game_start")
        start_button.disabled = true;
        socket.emit('start-game', roomName)
    });

    socket.on('disable-start-button',() => {
      start_button.disabled = true;
    });

    canvas.height = window.innerHeight*0.7;
    canvas.width = window.innerWidth*0.5;

    window.addEventListener("resize", ()=>{
      canvas.height = window.innerHeight*0.7;
      canvas.width = window.innerWidth*0.5;
    })

    let paint = false;
      function startDraw()
      {
        paint = true;
      }
      function endDraw()
      {
        paint = false;
        ctx.beginPath();
        socket.emit('drawing-end', roomName);
      }
      function Draw()
      {
        if(!paint)
        return;
        ctx.lineCap = 'round';
        x1 = event.clientX;
        y1 = event.clientY;
        ctx.lineTo(x1, y1);
        ctx.stroke();
        ctx.beginPath();
        x2 = event.clientX;
        y2 = event.clientY;
        ctx.moveTo(x2, y2);
        socket.emit('drawing', roomName, {
          x1 : x1 / canvas.width,
          y1 : y1 / canvas.height,
          x2 : x2 / canvas.width,
          y2 : y2 / canvas.height,
          style : ctx.strokeStyle,
          width : ctx.lineWidth
        });
      }
      function change(value)
      {
        ctx.strokeStyle = value;
      }
      function changeWidth()
      {
        ctx.lineWidth = document.getElementById("thickness").value;
      }
      function drawingEvent(data)
      {
        ctx.lineCap = 'round';
        ctx.strokeStyle = data.style;
        ctx.lineWidth = data.width;
        ctx.lineTo(data.x1*canvas.width, data.y1*canvas.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(data.x2*canvas.width, data.y2*canvas.height);
      }
    socket.on('drawing-data', drawingEvent);
    socket.on('drawing-end', () => ctx.beginPath());
    socket.on('round-begin', (word, room) => {
        socket.emit('initialize-score',room,name);
        canvas.addEventListener("mousedown", startDraw);
        canvas.addEventListener("mouseup", endDraw);
        canvas.addEventListener("mousemove", Draw);
        votekick_button.disabled = true;
        alert(`You are drawing now. Your word is: ${word}`);
        word_container.innerHTML = word;
        socket.emit('word-length', room, word.length);
        guessed = true;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    });

    function vote(){
      votekick_button.disabled = true;
      socket.emit('send-vote', roomName, name )
    }

    socket.on('votekick-message', (voter_name, curr_player_name, vote, num_palyer, kicked_out, kick_socket) =>{ 
      if(socket.sessionid != kick_socket){
        if(kicked_out) appendMessage(`${curr_player_name} has been kicked out!!`, "#FF0000")
        else appendMessage(`'${voter_name}' is voting to kick '${curr_player_name}'  (${vote}/${num_palyer-1})`, "#FFFF00")
      }
      else if(kicked_out) alert(`You have been kicked out !!`)
    });

    socket.on('display-scores' , (scores_dict, name_dict, start) =>{
      new_dict = {};
      var str = start;
      for([key,val] of Object.entries(scores_dict)){
        if(name_dict[key] != undefined)
        str = str + `${name_dict[key]} :    ${scores_dict[key]}\n`
      }
      console.log(str)
      alert(str);
      socket.emit('initialize-score',roomName)
    })

    // popover
    socket.on('guess-length', (num) => {
        canvas.removeEventListener("mousedown", startDraw);
        canvas.removeEventListener("mouseup", endDraw);
        canvas.removeEventListener("mousemove", Draw);
        votekick_button.disabled = false;
        var guess = '*'.repeat(num);
        word_container.innerHTML = guess;
        guessed = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    });
    socket.on('correct-guess', () => {
        guessed = true;
        appendMessage('You guessed correctly', "#90EE90");
        // socket.emit('update-guess-count');
        socket.emit('update-score', roomName);
    });
    socket.on('made-guess', (name) => {
        appendMessage(`${name} guessed the word correctly`, "#90EE90");
    });
    socket.on('time', (time) => {
        time_container.innerHTML = `Time Left: ${time}`;
    });
    socket.on('peer-disconnect', userId => {
      if(peers[userId])peers[userId].close();
    });
    function connectToNewUser(userId, stream)
    {
        const call = myPeer.call(userId, stream)
        const video = document.createElement('video')
        call.on('stream', userVideoStream => {
            addVideoStream(video, userVideoStream)
        })
        call.on('close', () => {
          video.remove()
        })

        peers[userId] = call
    }


}

socket.on('chat-message',(data, guess_this) => {
    if(!guess_this)
        appendMessage(`${data.name}: ${data.message}`, "#000000")
    else
    {
        if(guessed)
        {
            appendMessage(`${data.name}: ${data.message}`, "#00FFFF")
        }
    }
});

socket.on('user-connected', name => {
    appendMessage(`${name} connected`, "#90EE90")
});

socket.on('clear-score-board', () => {
  score_container.innerText = "";
})

socket.on('edit-score-board', (scores_dict , name_dict) => {
  for([key,val] of Object.entries(scores_dict)){
    if(name_dict[key] != undefined)
    {
    var scoreElement = document.createElement('div')
    scoreElement.innerText = `${name_dict[key]} : ${val}`
    score_container.append(scoreElement)
    }
  }

});

socket.on('user-disconnected', name => {
    appendMessage(`${name} disconnected`, "#FFFF00")
});

socket.on('kick-out', () => {
    alert("You have been kicked out")
});

socket.on('room-created', room => {
    const roomElement = document.createElement('div');
    roomElement.innerText = room;
    const roomLink = document.createElement('a');
    roomLink.href = `/${room}`;
    roomLink.innerText = 'join';
    room_container.append(roomElement);
    room_container.append(roomLink);
});

socket.on('redirect', function(destination) {
  window.location.href = destination;
});

function appendMessage(message, color) {
    const messageElement = document.createElement('div')
    messageElement.innerText = message
    messageElement.style.color = color
    messageContainer.append(messageElement)
}

function addVideoStream(video, stream)
{
    video.srcObject = stream
    video.addEventListener('loadedmetadata', () => {
    video.play()
    })
    videoGrid.append(video)
}

