const express = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// تخزين الغرف المفتوحة
const rooms = {}; 

app.get('/', (req, res) => {
    res.send('سيرفر البحث التلقائي الذكي لـ Godot 4 يعمل بنجاح!');
});

wss.on('connection', (ws) => {
    let currentRoom = null;
    let playerId = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.action === "create_room") {
                playerId = data.player_id;
                currentRoom = data.room_code;

                rooms[currentRoom] = {
                    players: { [playerId]: ws },
                    host: playerId,
                    status: "waiting"
                };

                ws.send(JSON.stringify({ action: "room_created", room_code: currentRoom }));
            }

            if (data.action === "join_room") {
                playerId = data.player_id;
                let targetRoom = data.room_code;

                if (!targetRoom || targetRoom.trim() === "") {
                    for (const code in rooms) {
                        if (rooms[code].status === "waiting") {
                            targetRoom = code;
                            break;
                        }
                    }
                }

                if (targetRoom && rooms[targetRoom] && rooms[targetRoom].status === "waiting") {
                    currentRoom = targetRoom;
                    rooms[currentRoom].players[playerId] = ws;
                    rooms[currentRoom].status = "playing";

                    ws.send(JSON.stringify({ action: "joined_success", room_code: currentRoom }));

                    Object.keys(rooms[currentRoom].players).forEach((id) => {
                        if (id !== playerId) {
                            rooms[currentRoom].players[id].send(JSON.stringify({ 
                                action: "player_joined", 
                                player_id: playerId 
                            }));
                        }
                    });
                } else {
                    ws.send(JSON.stringify({ action: "error", message: "لا توجد غرف متاحة!" }));
                }
            }

            if (data.action === "game_update" && currentRoom && rooms[currentRoom]) {
                Object.keys(rooms[currentRoom].players).forEach((id) => {
                    if (id !== playerId) {
                        rooms[currentRoom].players[id].send(JSON.stringify({
                            action: "game_update",
                            player_id: playerId,
                            game_data: data.game_data
                        }));
                    }
                });
            }

        } catch (e) {
            console.error("خطأ:", e);
        }
    });

    ws.on('close', () => {
        if (currentRoom && rooms[currentRoom]) {
            delete rooms[currentRoom].players[playerId];
            Object.keys(rooms[currentRoom].players).forEach((id) => {
                rooms[currentRoom].players[id].send(JSON.stringify({ action: "player_left", player_id: playerId }));
            });
            if (Object.keys(rooms[currentRoom].players).length === 0) {
                delete rooms[currentRoom];
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل الآن بنجاح على المنفذ: ${PORT}`);
});
