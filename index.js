const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const port = process.env.PORT || 3000;

// إعداد خادم HTTP أساسي
const server = http.createServer(app);

// إنشاء سيرفر الـ WebSocket وربطه بالخادم
const wss = new WebSocketServer({ server });

// قاعدة بيانات مؤقتة لتخزين الغرف واللاعبين بداخلها
const rooms = {};

app.get('/', (req, res) => {
    res.send('Signaling Server is Running Perfectly!');
});

wss.on('connection', (ws) => {
    let currentRoom = null;
    let playerId = null;
    let pName = "";

    console.log('🌐 [SERVER] لاعب جديد اتصل بسيرفر الإشارات السحابي.');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // 1️⃣ إنشاء غرفة جديدة من قبل الـ Host
            if (data.action === "create_room") {
                playerId = data.player_id;
                currentRoom = data.room_code;
                pName = data.player_name || "Host";

                rooms[currentRoom] = {
                    players: { 
                        [playerId]: { ws: ws, name: pName } 
                    },
                    host: playerId,
                    status: "waiting"
                };

                console.log(`🏠 [ROOM CREATED] المضيف [${pName}] أنشأ الغرفة بنجاح بكود: ${currentRoom}`);
                ws.send(JSON.stringify({ action: "room_created", room_code: currentRoom }));
            }

            // 2️⃣ انضمام لاعب آخر (Guest) إلى الغرفة
            if (data.action === "join_room") {
                playerId = data.player_id;
                let targetRoom = data.room_code;
                pName = data.player_name || "Guest";

                if (targetRoom && rooms[targetRoom] && rooms[targetRoom].status === "waiting") {
                    currentRoom = targetRoom;
                    rooms[currentRoom].players[playerId] = { ws: ws, name: pName };
                    rooms[currentRoom].status = "playing"; // تحديث حالة الغرفة لمنع دخول طرف ثالث

                    console.log(`🤝 [PLAYER JOINED] اللاعب [${pName}] انضم للغرفة: ${currentRoom}`);

                    // إرسال نجاح الدخول للضيف نفسه
                    ws.send(JSON.stringify({ action: "joined_success", room_code: currentRoom }));

                    // 🔥 الخدعة الجوهرية: جلب اسم الـ Host وإرسال إشارة المزامنة الفورية للطرفين معاً
                    const playersInRoom = rooms[currentRoom].players;
                    const hostId = rooms[currentRoom].host;
                    const hostName = playersInRoom[hostId].name;

                    Object.keys(playersInRoom).forEach((id) => {
                        playersInRoom[id].ws.send(JSON.stringify({ 
                            action: "lobby_sync", 
                            host_name: hostName,
                            guest_name: pName,
                            is_ready: true
                        }));
                    });
                    console.log(`📡 [LOBBY SYNC] تم إرسال بيانات الأسماء والمزامنة قسرياً لـ ${hostName} و ${pName}`);
                } else {
                    console.log(`❌ [JOIN FAILED] محاولة فاشلة لدخول الغرفة: ${targetRoom}`);
                    ws.send(JSON.stringify({ action: "error", message: "الغرفة غير موجودة أو ممتلئة باللاعبين!" }));
                }
            }

            // 3️⃣ تمرير حزم الـ WebRTC (Offers, Answers, Candidates) أثناء اللعب
            if (data.action === "game_update" && currentRoom && rooms[currentRoom]) {
                Object.keys(rooms[currentRoom].players).forEach((id) => {
                    if (id !== playerId) {
                        rooms[currentRoom].players[id].ws.send(JSON.stringify({
                            action: "game_update",
                            player_id: playerId,
                            game_data: data.game_data
                        }));
                    }
                });
            }

        } catch (e) {
            console.error("🚨 [ERROR] حدث خطأ في معالجة البيانات النصية القادمة:", e);
        }
    });

    // 4️⃣ التعامل مع خروج أو انقطاع اتصال أحد اللاعبين
    ws.on('close', () => {
        console.log(`🚪 [DISCONNECTED] لاعب انقطع اتصاله بالشبكة.`);
        if (currentRoom && rooms[currentRoom]) {
            delete rooms[currentRoom].players[playerId];
            
            // إبلاغ بقية اللاعبين في الغرفة بالخروج
            Object.keys(rooms[currentRoom].players).forEach((id) => {
                rooms[currentRoom].players[id].ws.send(JSON.stringify({ action: "player_left", player_id: playerId }));
            });
            
            // إذا أصبحت الغرفة فارغة تماماً يتم حذفها نهائياً لتوفير موارد السيرفر
            if (Object.keys(rooms[currentRoom].players).length === 0) {
                console.log(`🗑️ [ROOM DELETED] تم تدمير الغرفة ${currentRoom} لعدم وجود لاعبين بها.`);
                delete rooms[currentRoom];
            }
        }
    });
});

// تشغيل السيرفر والاستماع للمنفذ المحدد
server.listen(port, () => {
    console.log(`🚀 [SERVER RUNNING] السيرفر المطور يعمل بنجاح على بورت: ${port}`);
});
                        
