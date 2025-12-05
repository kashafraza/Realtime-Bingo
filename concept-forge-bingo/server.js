const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

const rooms = {};

function generateBingoBoard() {
    const numbers = Array.from({ length: 25 }, (_, i) => i + 1);
    for (let i = numbers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
    }
    return numbers;
}

function checkWin(markedIndices) {
    let completedLines = 0;
    
    for (let i = 0; i < 5; i++) {
        let rowComplete = true;
        for (let j = 0; j < 5; j++) {
            if (!markedIndices.includes(i * 5 + j)) {
                rowComplete = false;
                break;
            }
        }
        if (rowComplete) completedLines++;
    }
    
    for (let i = 0; i < 5; i++) {
        let colComplete = true;
        for (let j = 0; j < 5; j++) {
            if (!markedIndices.includes(j * 5 + i)) {
                colComplete = false;
                break;
            }
        }
        if (colComplete) completedLines++;
    }
    
    let diagonal1 = true;
    for (let i = 0; i < 5; i++) {
        if (!markedIndices.includes(i * 5 + i)) {
            diagonal1 = false;
            break;
        }
    }
    if (diagonal1) completedLines++;
    
    let diagonal2 = true;
    for (let i = 0; i < 5; i++) {
        if (!markedIndices.includes(i * 5 + (4 - i))) {
            diagonal2 = false;
            break;
        }
    }
    if (diagonal2) completedLines++;
    
    return completedLines >= 5;
}

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    socket.on('createRoom', (playerName) => {
        const roomCode = generateRoomCode();
        const board = generateBingoBoard();
        
        rooms[roomCode] = {
            host: socket.id,
            players: [{
                id: socket.id,
                name: playerName,
                board: board,
                markedIndices: []
            }],
            gameStarted: false,
            currentTurn: 0
        };
        
        socket.join(roomCode);
        socket.emit('roomCreated', { roomCode, board, isHost: true });
        console.log(`Room ${roomCode} created by ${playerName}`);
    });
    
    socket.on('joinRoom', ({ roomCode, playerName }) => {
        const room = rooms[roomCode];
        
        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }
        
        if (room.gameStarted) {
            socket.emit('error', 'Game already in progress');
            return;
        }
        
        const board = generateBingoBoard();
        room.players.push({
            id: socket.id,
            name: playerName,
            board: board,
            markedIndices: []
        });
        
        socket.join(roomCode);
        socket.emit('roomJoined', { roomCode, board, isHost: false });
        
        io.to(roomCode).emit('updatePlayers', {
            players: room.players.map(p => ({ name: p.name, id: p.id })),
            playerCount: room.players.length
        });
        
        console.log(`${playerName} joined room ${roomCode}`);
    });
    
    socket.on('startGame', (roomCode) => {
        const room = rooms[roomCode];
        
        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }
        
        if (room.host !== socket.id) {
            socket.emit('error', 'Only host can start the game');
            return;
        }
        
        if (room.players.length < 2) {
            socket.emit('error', 'Need at least 2 players to start');
            return;
        }
        
        room.gameStarted = true;
        room.currentTurn = 0;
        
        io.to(roomCode).emit('gameStarted', {
            currentPlayer: room.players[0].name,
            currentPlayerId: room.players[0].id
        });
        
        console.log(`Game started in room ${roomCode}`);
    });
    
    socket.on('selectNumber', ({ roomCode, numberIndex }) => {
        const room = rooms[roomCode];
        
        if (!room || !room.gameStarted) {
            return;
        }
        
        const currentPlayer = room.players[room.currentTurn];
        
        if (currentPlayer.id !== socket.id) {
            socket.emit('error', 'Not your turn');
            return;
        }
        
        const selectedNumber = currentPlayer.board[numberIndex];
        
        room.players.forEach(player => {
            for (let i = 0; i < player.board.length; i++) {
                if (player.board[i] === selectedNumber && !player.markedIndices.includes(i)) {
                    player.markedIndices.push(i);
                    break;
                }
            }
        });
        
        const allPlayerBoards = room.players.map(p => ({
            id: p.id,
            markedIndices: p.markedIndices
        }));
        
        io.to(roomCode).emit('numberCalled', {
            number: selectedNumber,
            calledBy: currentPlayer.name,
            allPlayerBoards: allPlayerBoards
        });
        
        if (checkWin(currentPlayer.markedIndices)) {
            io.to(roomCode).emit('gameWon', {
                winner: currentPlayer.name,
                winnerId: currentPlayer.id
            });
            room.gameStarted = false;
            console.log(`${currentPlayer.name} won in room ${roomCode}`);
            return;
        }
        
        room.currentTurn = (room.currentTurn + 1) % room.players.length;
        const nextPlayer = room.players[room.currentTurn];
        
        io.to(roomCode).emit('turnChanged', {
            currentPlayer: nextPlayer.name,
            currentPlayerId: nextPlayer.id
        });
    });
    
    socket.on('chatMessage', ({ roomCode, message }) => {
        const room = rooms[roomCode];
        if (!room) return;
        
        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            io.to(roomCode).emit('chatMessage', {
                playerName: player.name,
                message: message
            });
        }
    });
    
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        Object.keys(rooms).forEach(roomCode => {
            const room = rooms[roomCode];
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            
            if (playerIndex !== -1) {
                const player = room.players[playerIndex];
                room.players.splice(playerIndex, 1);
                
                if (room.players.length === 0) {
                    delete rooms[roomCode];
                    console.log(`Room ${roomCode} deleted`);
                } else {
                    if (room.host === socket.id) {
                        room.host = room.players[0].id;
                        io.to(room.players[0].id).emit('becameHost');
                    }
                    
                    io.to(roomCode).emit('playerLeft', {
                        playerName: player.name,
                        players: room.players.map(p => ({ name: p.name, id: p.id })),
                        playerCount: room.players.length
                    });
                }
            }
        });
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
