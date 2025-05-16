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
            socket.emit('ice-candidate', { sessionId: sessionId, candidate: event.candidate.toJSON() });
        }
    };
    pc.ondatachannel = (event) => {
        dataChannel = event.channel;
        setupDataChannel();
    };
}

function setupDataChannel() {
    dataChannel.onmessage = (event) => {
        if (typeof event.data === 'string') {
            const message = JSON.parse(event.data);
            if (message.type === 'file-info') {
                fileSize = message.size;
                document.getElementById('status').textContent = `Receiving: ${message.name}`;
                document.getElementById('receiver-section').style.display = 'block';
                document.getElementById('receive-progress').value = 0;
                chunks = [];
                receivedSize = 0;
            } else if (message.type === 'end') {
                const blob = new Blob(chunks);
                const url = URL.createObjectURL(blob);
                document.getElementById('download-link').href = url;
                document.getElementById('download-link').download = message.name;
                document.getElementById('download-link').style.display = 'inline';
                document.getElementById('status').textContent = 'File received!';
                chunks = [];
                receivedSize = 0;
            }
        } else {
            chunks.push(event.data);
            receivedSize += event.data.byteLength;
            const progress = (receivedSize / fileSize) * 100;
            document.getElementById('receive-progress').value = progress;
        }
    };
    dataChannel.onopen = () => {
        document.getElementById('sender-section').style.display = 'block';
        document.getElementById('status').textContent = 'Connected. Ready to send files.';
    };
    dataChannel.onclose = () => {
        document.getElementById('sender-section').style.display = 'none';
        document.getElementById('status').textContent = 'Connection closed.';
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
    document.getElementById('session-id').disabled = true;
    document.getElementById('join-btn').disabled = true;
});

socket.on('peer-joined', () => {
    document.getElementById('status').textContent = 'Peer joined. Creating connection...';
    createPeerConnection();
    dataChannel = pc.createDataChannel('fileTransfer');
    setupDataChannel();
    pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
            socket.emit('offer', { sessionId: sessionId, offer: pc.localDescription.toJSON() });
        })
        .catch(error => {
            console.error('Error creating offer:', error);
            document.getElementById('status').textContent = 'Error creating offer.';
        });
});

document.getElementById('send-btn').addEventListener('click', () => {
    file = document.getElementById('file-input').files[0];
    if (!file) {
        alert('Please select a file');
        return;
    }
    if (!dataChannel || dataChannel.readyState !== 'open') {
        alert('Data channel not ready. Please wait...');
        return;
    }
    sendFile();
});

function sendFile() {
    const chunkSize = 16384;
    const fileReader = new FileReader();
    let offset = 0;
    fileReader.onload = (e) => {
        try {
            dataChannel.send(e.target.result);
            offset += e.target.result.byteLength;
            const progress = (offset / file.size) * 100;
            document.getElementById('send-progress').value = progress;
            if (offset < file.size) {
                readSlice(offset);
            } else {
                dataChannel.send(JSON.stringify({ type: 'end', name: file.name }));
                document.getElementById('status').textContent = 'File sent!';
                document.getElementById('send-progress').value = 0;
            }
        } catch (error) {
            console.error('Error sending chunk:', error);
            document.getElementById('status').textContent = 'Error sending file.';
        }
    };
    fileReader.onerror = (error) => {
        console.error('FileReader error:', error);
        document.getElementById('status').textContent = 'Error reading file.';
    };
    const readSlice = (o) => {
        const slice = file.slice(offset, o + chunkSize);
        fileReader.readAsArrayBuffer(slice);
    };
    dataChannel.send(JSON.stringify({
        type: 'file-info',
        name: file.name,
        size: file.size
    }));
    readSlice(0);
}

socket.on('offer', (data) => {
    if (!data || typeof data !== 'object' || !data.type || !data.sdp) {
        console.error('Invalid offer received:', data);
        return;
    }
    createPeerConnection();
    pc.setRemoteDescription(new RTCSessionDescription(data))
        .then(() => pc.createAnswer())
        .then(answer => pc.setLocalDescription(answer))
        .then(() => {
            socket.emit('answer', { sessionId: sessionId, answer: pc.localDescription.toJSON() });
        })
        .catch(error => {
            console.error('Error handling offer:', error);
            document.getElementById('status').textContent = 'Error handling offer.';
        });
});

socket.on('answer', (data) => {
    if (!data || typeof data !== 'object' || !data.type || !data.sdp) {
        console.error('Invalid answer received:', data);
        return;
    }
    pc.setRemoteDescription(new RTCSessionDescription(data))
        .catch(error => {
            console.error('Error setting answer:', error);
            document.getElementById('status').textContent = 'Error setting answer.';
        });
});

socket.on('ice-candidate', (data) => {
    if (!data || typeof data !== 'object' || !data.candidate) {
        console.error('Invalid ICE candidate received:', data);
        return;
    }
    if (pc) {
        pc.addIceCandidate(new RTCIceCandidate(data))
            .catch(error => console.error('Error adding ICE candidate:', error));
    }
});