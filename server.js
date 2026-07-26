const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('Public'));

// Store waiting users by gender preference
// structure: { id, gender, targetGender }
let waitingQueue = [];

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // When a user requests a match
    socket.on('find-match', (data) => {
        const { myGender, targetGender } = data;
        socket.userData = { myGender, targetGender };

        // Search for a matching user in queue
        const matchIndex = waitingQueue.findIndex((peer) => {
            if (peer.id === socket.id) return false;

            const myMatch = (targetGender === 'any' || peer.myGender === targetGender);
            const peerMatch = (peer.targetGender === 'any' || myGender === peer.targetGender);

            return myMatch && peerMatch;
        });

        if (matchIndex !== -1) {
            // Match found!
            const peer = waitingQueue.splice(matchIndex, 1)[0];
            const roomId = `room_${socket.id}_${peer.id}`;

            socket.join(roomId);
            io.sockets.sockets.get(peer.id)?.join(roomId);

            socket.peerId = peer.id;
            const peerSocket = io.sockets.sockets.get(peer.id);
            if (peerSocket) peerSocket.peerId = socket.id;

            // Notify initiator (the peer who was waiting) to send a WebRTC offer
            io.to(peer.id).emit('match-found', { roomId, initiator: true });
            socket.emit('match-found', { roomId, initiator: false });
        } else {
            // No match found yet, push to queue
            waitingQueue.push({ id: socket.id, myGender, targetGender });
        }
    });

    // WebRTC Signaling Events
    socket.on('signal', (data) => {
        if (socket.peerId) {
            io.to(socket.peerId).emit('signal', data);
        }
    });

    // Text Chat Routing
    socket.on('send-message', (msg) => {
        if (socket.peerId) {
            io.to(socket.peerId).emit('receive-message', msg);
        }
    });

    // Handle skip/disconnect
    socket.on('skip', () => {
        cleanUpAndNotify(socket);
    });

    socket.on('disconnect', () => {
        cleanUpAndNotify(socket);
        waitingQueue = waitingQueue.filter((p) => p.id !== socket.id);
    });

    function cleanUpAndNotify(s) {
        if (s.peerId) {
            io.to(s.peerId).emit('peer-disconnected');
            const peerSocket = io.sockets.sockets.get(s.peerId);
            if (peerSocket) peerSocket.peerId = null;
            s.peerId = null;
        }
        waitingQueue = waitingQueue.filter((p) => p.id !== s.id);
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
