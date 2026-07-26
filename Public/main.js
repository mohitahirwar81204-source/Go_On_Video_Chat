const socket = io();

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const chatBox = document.getElementById('chatBox');
const msgInput = document.getElementById('msgInput');
const sendBtn = document.getElementById('sendBtn');
const skipBtn = document.getElementById('skipBtn');
const startBtn = document.getElementById('startBtn');

let localStream;
let peerConnection;

const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Initialize webcam feed immediately
async function initMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
    } catch (err) {
        alert('Camera and microphone access are required.');
        console.error(err);
    }
}
initMedia();

function startMatch() {
    appendSystemMessage('Searching for a partner...');
    startBtn.disabled = true;
    skipBtn.disabled = false;

    const myGender = document.getElementById('myGender').value;
    const targetGender = document.getElementById('targetGender').value;

    socket.emit('find-match', { myGender, targetGender });
}

function skipMatch() {
    resetConnection();
    socket.emit('skip');
    startMatch();
}

// Handle socket pairing
socket.on('match-found', async ({ initiator }) => {
    appendSystemMessage('Connected to a stranger!');
    toggleChat(true);

    peerConnection = new RTCPeerConnection(rtcConfig);

    // Add local media tracks
    localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

    // Display remote media track
    peerConnection.ontrack = (e) => {
        remoteVideo.srcObject = e.streams[0];
    };

    // Send ICE candidates via signaling server
    peerConnection.onicecandidate = (e) => {
        if (e.candidate) {
            socket.emit('signal', { candidate: e.candidate });
        }
    };

    if (initiator) {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('signal', { sdp: peerConnection.localDescription });
    }
});

socket.on('signal', async (data) => {
    if (!peerConnection) return;

    if (data.sdp) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
        if (data.sdp.type === 'offer') {
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('signal', { sdp: peerConnection.localDescription });
        }
    } else if (data.candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
});

socket.on('peer-disconnected', () => {
    appendSystemMessage('Stranger disconnected.');
    resetConnection();
});

// Chat handlers
function sendMessage() {
    const msg = msgInput.value.trim();
    if (!msg) return;

    appendChatMessage(msg, 'me');
    socket.emit('send-message', msg);
    msgInput.value = '';
}

msgInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

socket.on('receive-message', (msg) => {
    appendChatMessage(msg, 'peer');
});

function appendChatMessage(msg, sender) {
    const div = document.createElement('div');
    div.classList.add('chat-message', sender);
    div.innerText = msg;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function appendSystemMessage(msg) {
    const div = document.createElement('div');
    div.classList.add('chat-message', 'system');
    div.innerText = msg;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function toggleChat(enabled) {
    msgInput.disabled = !enabled;
    sendBtn.disabled = !enabled;
}

function resetConnection() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    remoteVideo.srcObject = null;
    toggleChat(false);
}