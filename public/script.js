const socket = io('http://localhost:5500')
const messageContainer = document.getElementById('message-container')
const messageForm = document.getElementById('send-container')
const startForm = document.getElementById('start-button-container')
const messageInput = document.getElementById('message-input')
const room_container = document.getElementById('room-container')
const word_container = document.getElementById('word-container')
var canvas = document.getElementById("canvas");
var ctx = canvas.getContext("2d");

if (messageForm != null){
    if (roomPass != ''){
        const pass = prompt('Enter The Password');
        if (pass != roomPass){
            location.href = "/";
        }
    }
    const name = prompt('What is your name?');
    appendMessage('You joined');
    socket.emit('new-user', roomName, name);
    messageForm.addEventListener('submit', e => {
        e.preventDefault()
        const message = messageInput.value
        appendMessage(`You: ${  message}`)
        socket.emit('send-chat-message', roomName, message)
        messageInput.value = ''
    });

    startForm.addEventListener('submit', e => {
        e.preventDefault()
        socket.emit('start-game', roomName)
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
    canvas.addEventListener("mousedown", startDraw);
    canvas.addEventListener("mouseup", endDraw);
    canvas.addEventListener("mousemove", Draw);
    socket.on('drawing-data', drawingEvent);
    socket.on('drawing-end', () => ctx.beginPath());
    socket.on('round-begin', (word, room) => {
        word_container.innerHTML = word;
        socket.emit('word-length', room, word.length);
    });
    socket.on('guess-length', (num) => {
        var guess = '*'.repeat(num);
        word_container.innerHTML = guess;
    });
}



socket.on('chat-message',data => {
    appendMessage(`${data.name}: ${data.message}`)
});

socket.on('user-connected', name => {
    appendMessage(`${name} connected`)
});

socket.on('user-disconnected', name => {
    appendMessage(`${name} disconnected`)
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

function appendMessage(message) {
    const messageElement = document.createElement('div')
    messageElement.innerText = message
    messageContainer.append(messageElement)
}
