const socket = io();
let sessionId;
let pc;
let dataChannel;
let file;
let fileSize;
let receivedSize = 0;
let chunks = [];

function createPeerConnection() {
    pc = new RTCPeerConnection();
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', { sessionId: sessionId, candidate: event.candidate });
        }
    };
    pc.ondatachannel = (event) => {
        dataChannel = event.channel;
        setupDataChannel();
    };
}

function setupDataChannel() {
    dataChannel.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'file-info') {
            fileSize = message.size;
            document.getElementById('status').textContent = `Receiving: ${message.name}`;
            document.getElementById('receiver-section').style.display = 'block';
        } else if (message.type === 'chunk') {
            chunks.push(message.data);
            receivedSize += message.data.byteLength;
            const progress = (receivedSize / fileSize) * 100;
            document.getElementById('receive-progress').value = progress;
        } else if (message.type === 'end') {
            const blob = new Blob(chunks);
            const url = URL.createObjectURL(blob);
            document.getElementById('download-link').href = url;
            document.getElementById('download-link').download = message.name;
            document.getElementById('download-link').style.display = 'inline';
            document.getElementById('status').textContent = 'File received!';
        }
    };
}

document.getElementById('join-btn').addEventListener('click', () => {
    sessionId = document.getElementById('session-id').value.trim();
    if (!sessionId) {
        alert('Please enter a session ID');
        return;
    }
    socket.emit('join', sessionId);
    document.getElementById('status').textContent = `Joined session: ${sessionId}`;
});

document.getElementById('send-btn').addEventListener('click', () => {
    file = document.getElementById('file-input').files[0];
    if (!file) {
        alert('Please select a file');
        return;
    }
    createPeerConnection();
    dataChannel = pc.createDataChannel('fileTransfer');
    dataChannel.onopen = () => {
        sendFile();
    };
    pc.createOffer().then((offer) => {
        pc.setLocalDescription(offer);
        socket.emit('offer', { sessionId: sessionId, offer: offer });
    });
});

function sendFile() {
    const chunkSize = 16384; // 16KB chunks for optimal performance
    const fileReader = new FileReader();
    let offset = 0;
    fileReader.onload = (e) => {
        dataChannel.send(JSON.stringify({ type: 'chunk', data: e.target.result }));
        offset += e.target.result.byteLength;
        const progress = (offset / file.size) * 100;
        document.getElementById('send-progress').value = progress;
        if (offset < file.size) {
            readSlice(offset);
        } else {
            dataChannel.send(JSON.stringify({ type: 'end', name: file.name }));
            document.getElementById('status').textContent = 'File sent!';
        }
    };
    const readSlice = (o) => {
        const slice = file.slice(offset, o + chunkSize);
        fileReader.readAsArrayBuffer(slice);
    };
    dataChannel.send(JSON.stringify({ type: 'file-info', name: file.name, size: file.size }));
    readSlice(0);
}

socket.on('offer', (data) => {
    createPeerConnection();
    pc.setRemoteDescription(new RTCSessionDescription(data.offer)).then(() => {
        pc.createAnswer().then((answer) => {
            pc.setLocalDescription(answer);
            socket.emit('answer', { sessionId: sessionId, answer: answer });
        });
    });
});

socket.on('answer', (data) => {
    pc.setRemoteDescription(new RTCSessionDescription(data.answer));
});

socket.on('ice-candidate', (data) => {
    pc.addIceCandidate(new RTCIceCandidate(data.candidate));
});