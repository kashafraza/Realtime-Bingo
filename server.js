const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

const rooms = {};
const MAX_PLAYERS_PER_ROOM = 5;

function getRoomPlayers(room) {
    return room.players.map(player => ({
        id: player.id,
        name: player.name,
        isHost: player.id === room.host,
        isReady: player.isReady
    }));
}

function broadcastRoomPlayers(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;

    io.to(roomCode).emit('updatePlayers', {
        players: getRoomPlayers(room),
        playerCount: room.players.length,
        hostId: room.host
    });
}

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
                markedIndices: [],
                isReady: true
            }],
            gameStarted: false,
            currentTurn: 0
        };
        
        socket.join(roomCode);
        socket.emit('roomCreated', { roomCode, board, isHost: true });
        broadcastRoomPlayers(roomCode);
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

        if (room.players.length >= MAX_PLAYERS_PER_ROOM) {
            socket.emit('error', `Room is full (maximum ${MAX_PLAYERS_PER_ROOM} players)`);
            return;
        }
        
        const board = generateBingoBoard();
        room.players.push({
            id: socket.id,
            name: playerName,
            board: board,
            markedIndices: [],
            isReady: false
        });
        
        socket.join(roomCode);
        socket.emit('roomJoined', { roomCode, board, isHost: false });
        
        broadcastRoomPlayers(roomCode);
        
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

        if (!room.players.every(player => player.id === room.host || player.isReady)) {
            socket.emit('error', 'Wait until every player is ready');
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

    socket.on('randomizeBoard', (roomCode) => {
        const room = rooms[roomCode];

        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }

        if (room.gameStarted) {
            socket.emit('error', 'The grid cannot be randomized after the game starts');
            return;
        }

        const player = room.players.find(player => player.id === socket.id);
        if (!player) {
            socket.emit('error', 'You are not in this room');
            return;
        }

        player.board = generateBingoBoard();
        player.markedIndices = [];
        player.isReady = player.id === room.host;
        socket.emit('boardRandomized', { board: player.board });
        broadcastRoomPlayers(roomCode);
    });

    socket.on('setReady', ({ roomCode, isReady }) => {
        const room = rooms[roomCode];
        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }
        if (room.gameStarted) {
            socket.emit('error', 'Readiness cannot be changed after the game starts');
            return;
        }

        const player = room.players.find(player => player.id === socket.id);
        if (!player) {
            socket.emit('error', 'You are not in this room');
            return;
        }

        if (player.id === room.host) {
            socket.emit('error', 'The host is always ready');
            return;
        }

        player.isReady = Boolean(isReady);
        broadcastRoomPlayers(roomCode);
    });

    socket.on('replayGame', (roomCode) => {
        const room = rooms[roomCode];

        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }

        if (room.host !== socket.id) {
            socket.emit('error', 'Only the host can replay the game');
            return;
        }

        if (room.gameStarted) {
            socket.emit('error', 'The current game is still in progress');
            return;
        }

        if (room.players.length < 2) {
            socket.emit('error', 'Need at least 2 players to replay');
            return;
        }

        room.players.forEach(player => {
            player.board = generateBingoBoard();
            player.markedIndices = [];
            player.isReady = player.id === room.host;
        });
        room.gameStarted = false;
        room.currentTurn = 0;

        room.players.forEach(player => {
            io.to(player.id).emit('boardRandomized', { board: player.board });
        });

        broadcastRoomPlayers(roomCode);
        io.to(roomCode).emit('gameReset', {
            message: 'A new game is ready. Randomize your grid, then mark yourself ready!'
        });
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
        
        // The client sends an index from its own shuffled board.  Resolve that
        // index to the number on the server, then find that same number on
        // every other shuffled board.  Indices cannot be shared between boards
        // because each player has a different layout.
        if (!Number.isInteger(numberIndex) || numberIndex < 0 || numberIndex >= currentPlayer.board.length) {
            socket.emit('error', 'Invalid board cell');
            return;
        }

        const selectedNumber = currentPlayer.board[numberIndex];
        
        room.players.forEach(player => {
            const matchingIndex = player.board.indexOf(selectedNumber);
            if (matchingIndex !== -1 && !player.markedIndices.includes(matchingIndex)) {
                player.markedIndices.push(matchingIndex);
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
        
        // A called number can complete five lines on a different player's
        // shuffled board.  Check every board after applying the number, not
        // just the board belonging to the player whose turn it was.
        const winningPlayers = room.players.filter(player => checkWin(player.markedIndices));

        if (winningPlayers.length > 0) {
            io.to(roomCode).emit('gameWon', {
                winner: winningPlayers[0].name,
                winnerId: winningPlayers[0].id,
                winners: winningPlayers.map(player => ({ id: player.id, name: player.name }))
            });
            room.gameStarted = false;
            room.currentTurn = null;
            console.log(`${winningPlayers.map(player => player.name).join(', ')} won in room ${roomCode}`);
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
                playerId: player.id,
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
                        const newHost = room.players[Math.floor(Math.random() * room.players.length)];
                        room.host = newHost.id;
                        newHost.isReady = true;
                        io.to(newHost.id).emit('becameHost');
                    }
                    
                    io.to(roomCode).emit('playerLeft', {
                        playerName: player.name
                    });
                    broadcastRoomPlayers(roomCode);
                }
            }
        });
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
