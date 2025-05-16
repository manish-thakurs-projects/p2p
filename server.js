const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

io.on('connection', (socket) => {
    socket.on('join', (sessionId) => {
        socket.join(sessionId);
        socket.to(sessionId).emit('peer-joined');
    });

    socket.on('offer', (data) => {
        socket.to(data.sessionId).emit('offer', data.offer);
    });

    socket.on('answer', (data) => {
        socket.to(data.sessionId).emit('answer', data.answer);
    });

    socket.on('ice-candidate', (data) => {
        socket.to(data.sessionId).emit('ice-candidate', data.candidate);
    });
});

http.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});