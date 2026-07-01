// ==============================================================================
// 🌐 index.js - النسخة الاحترافية والمضادة للأخطاء (Socket-Based Routing)
// ==============================================================================
const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('🟢 سيرفر ألعاب Godot يعمل بكفاءة مع نظام Sockets الجديد!');
    } else {
        res.writeHead(404);
        res.end();
    }
});

const wss = new WebSocket.Server({ server: server });

const players = new Map();       
const rooms = new Map();         
let matchmakingQueue = [];       

console.log(`=======================================================`);
console.log(`🚀 السيرفر الموحد يعمل الآن بنجاح على المنفذ: ${PORT}`);
console.log(`=======================================================`);

wss.on('connection', (ws) => {
    let currentPlayerName = "";
    console.log("📡 اتصال جديد قادم من أحد الهواتف...");

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const action = data.action;

            switch (action) {
                
                case 'register':
                    if (data.name && data.name.trim() !== "") {
                        currentPlayerName = data.name.trim();
                        players.set(currentPlayerName, ws);
                    }
                    break;

                case 'create_room':
                    const roomCode = data.room_code;
                    const roomType = data.room_type || "Public";
                    const creator = data.creator_name;

                    if (!roomCode) break;

                    rooms.set(roomCode, {
                        creator: creator,
                        type: roomType,
                        players: [creator],
                        status: "waiting",
                        hostSocket: ws // 🔑 حفظ الاتصال الفعلي للمضيف هنا!
                    });

                    console.log(`⚙️ تم فتح غرفة برمز: [${roomCode}]`);
                    
                    if (roomType === "Matchmaking") {
                        matchmakingQueue.push(roomCode);
                    }
                    break;

                case 'matchmaking':
                    const seeker = data.sender_name;
                    matchmakingQueue = matchmakingQueue.filter(code => rooms.has(code));

                    if (matchmakingQueue.length > 0) {
                        const targetRoomCode = matchmakingQueue.shift();
                        const room = rooms.get(targetRoomCode);

                        if (room && room.creator !== seeker) {
                            room.players.push(seeker);
                            room.status = "playing";
                            room.guestSocket = ws; // 🔑 حفظ الاتصال الفعلي للضيف

                            const syncPayload = JSON.stringify({
                                action: "room_sync",
                                host: room.creator || targetRoomCode,
                                guest: seeker || "PLAYER 2"
                            });

                            ws.send(syncPayload); // مزامنة الضيف
                            if (room.hostSocket && room.hostSocket.readyState === WebSocket.OPEN) {
                                room.hostSocket.send(syncPayload); // مزامنة المضيف
                            }
                            console.log(`🎮 تمت المطابقة بنجاح!`);
                        }
                    } else {
                        ws.send(JSON.stringify({ action: "room_not_found", message: "No available rooms" }));
                    }
                    break;

                case 'send_request':
                    const targetFriend = data.target;
                    const senderName = data.sender;

                    let foundRoomCode = null;
                    for (let [code, rDetails] of rooms.entries()) {
                        if (code === targetFriend || rDetails.creator === targetFriend) {
                            foundRoomCode = code;
                            break;
                        }
                    }

                    if (foundRoomCode) {
                        const room = rooms.get(foundRoomCode);
                        
                        if (room && !room.players.includes(senderName)) {
                            room.players.push(senderName);
                            room.status = "playing";
                            room.guestSocket = ws; // 🔑 حفظ الاتصال الفعلي للضيف
                        }

                        const syncPayload = JSON.stringify({
                            action: "room_sync",
                            host: room.creator || foundRoomCode,
                            guest: senderName || "PLAYER 2"
                        });

                        ws.send(syncPayload); // مزامنة الضيف
                        if (room.hostSocket && room.hostSocket.readyState === WebSocket.OPEN) {
                            room.hostSocket.send(syncPayload); // مزامنة المضيف فوراً بضمان 100%
                        }
                    } else {
                        ws.send(JSON.stringify({ action: "room_not_found", message: "ROOM DOES NOT EXIST" }));
                    }
                    break;

                case 'bridge_players':
                    // 🔑 تشغيل اللعبة لجميع من في الغرفة بغض النظر عن الأسماء!
                    let targetRoom = null;
                    for (let [code, r] of rooms.entries()) {
                        if (r.hostSocket === ws || r.guestSocket === ws) {
                            targetRoom = r;
                            break;
                        }
                    }

                    if (targetRoom) {
                        const finalPayload = JSON.stringify({ action: "start_game_scene" });
                        if (targetRoom.hostSocket && targetRoom.hostSocket.readyState === WebSocket.OPEN) {
                            targetRoom.hostSocket.send(finalPayload);
                        }
                        if (targetRoom.guestSocket && targetRoom.guestSocket.readyState === WebSocket.OPEN) {
                            targetRoom.guestSocket.send(finalPayload);
                        }
                        console.log(`⚡ تم بدء اللعبة ونقل اللاعبين!`);
                    }
                    break;
            }

        } catch (e) {
            console.error("⚠️ خطأ في المعالجة:", e.message);
        }
    });

    ws.on('close', () => {
        if (currentPlayerName !== "") {
            players.delete(currentPlayerName);
            for (let [code, room] of rooms.entries()) {
                if (room.creator === currentPlayerName) {
                    rooms.delete(code);
                    matchmakingQueue = matchmakingQueue.filter(c => c !== code);
                }
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`🟢 السيرفر يستقبل الاتصالات الآن.`);
});
