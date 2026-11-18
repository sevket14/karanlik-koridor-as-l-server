const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static(path.join(__dirname, "public")));
const PORT = process.env.PORT || 3000;

const rooms = new Map();

io.on("connection", (socket) => {

    console.log("Oyuncu bağlandı:", socket.id);

    socket.on("createRoom", (callback) => {

        const roomCode = Math.random()
            .toString(36)
            .substring(2, 8)
            .toUpperCase();

        rooms.set(roomCode, {
            players: [socket.id]
        });

        socket.join(roomCode);

        console.log("Oda oluşturuldu:", roomCode);

        callback({
            success: true,
            roomCode: roomCode
        });
    });

    socket.on("joinRoom", (roomCode, callback) => {

        const room = rooms.get(roomCode);

        if (!room) {
            return callback({
                success: false,
                message: "Oda bulunamadı!"
            });
        }

        if (room.players.length >= 8) {
            return callback({
                success: false,
                message: "Oda dolu!"
            });
        }

        room.players.push(socket.id);
        socket.join(roomCode);

        io.to(roomCode).emit("playerJoined", {
            playerId: socket.id,
            players: room.players
        });

        callback({
            success: true,
            roomCode: roomCode
        });
    });

    socket.on("playerMove", (data) => {

        const roomCode = [...socket.rooms]
            .find(room => room !== socket.id);

        if (!roomCode) return;

        socket.to(roomCode).emit("playerMoved", {
            playerId: socket.id,
            position: data.position,
            rotation: data.rotation
        });
    });

    socket.on("disconnect", () => {

        console.log("Oyuncu ayrıldı:", socket.id);

        for (const [roomCode, room] of rooms) {

            if (room.players.includes(socket.id)) {

                room.players = room.players.filter(
                    id => id !== socket.id
                );

                io.to(roomCode).emit("playerLeft", {
                    playerId: socket.id
                });

                if (room.players.length === 0) {
                    rooms.delete(roomCode);
                }
            }
        }
    });

});

server.listen(PORT, "0.0.0.0", () => {
    console.log(
        "Karanlık Koridor sunucusu " +
        PORT +
        " portunda çalışıyor!"
    );
});
