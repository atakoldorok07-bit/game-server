const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const port = process.env.PORT || 3000;

// إنشاء سيرفر الـ HTTP وربطه بالـ Express
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// قاعدة بيانات الغرف النشطة في الذاكرة
const rooms = {};

// صفحة فحص عمل السيرفر الأساسية
app.get('/', (req, res) => {
    res.send('<h1>🚀 VONE Signaling Server is fully active and running!</h1>');
});

wss.on('connection', (ws) => {
    let currentRoom = null;
    let playerId = null;
    let pName = "";
    let isHost = false; // متغير جديد لمعرفة ما إذا كان هذا الاتصال يخص المضيف

    console.log('🌐 [CONNECTION] جهاز جديد اتصل بالسيرفر الآن.');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            // تم إيقاف طباعة كل حزمة لمنع امتلاء الكونسول أثناء اللعب (يمكنك تفعيله عند الحاجة)
            // console.log(`📥 [RECEIVED]:`, data.action); 

            // 1️⃣ إنشاء غرفة جديدة (المضيف / Host)
            if (data.action === "create_room") {
                playerId = data.player_id;
                currentRoom = data.room_code;
                pName = data.player_name || "Host";
                isHost = true;

                // تهيئة هيكل الغرفة الشامل
                rooms[currentRoom] = {
                    players: {
                        [playerId]: { ws: ws, name: pName, id: playerId }
                    },
                    host: playerId,
                    status: "waiting",
                    createdAt: Date.now()
                };

                console.log(`🏠 [ROOM CREATED] المضيف [${pName}] أنشأ الغرفة بنجاح بكود: ${currentRoom}`);
                
                ws.send(JSON.stringify({ 
                    action: "room_created", 
                    room_code: currentRoom 
                }));
            }

            // 2️⃣ انضمام لاعب آخر للغرفة (الضيف / Guest)
            if (data.action === "join_room") {
                playerId = data.player_id;
                let targetRoom = data.room_code;
                pName = data.player_name || "Guest";
                isHost = false;

                if (targetRoom && rooms[targetRoom]) {
                    currentRoom = targetRoom;
                    
                    rooms[currentRoom].players[playerId] = { ws: ws, name: pName, id: playerId };
                    console.log(`🤝 [JOIN SUCCESS] اللاعب [${pName}] انضم للغرفة: ${currentRoom}`);

                    const hostId = rooms[currentRoom].host;
                    const hostNode = rooms[currentRoom].players[hostId];

                    // تأكيد الدخول للضيف
                    ws.send(JSON.stringify({ 
                        action: "joined_success", 
                        room_code: currentRoom
                    }));

                    // إعلام المضيف بدخول الضيف
                    if (hostNode && hostNode.ws.readyState === ws.OPEN) {
                        hostNode.ws.send(JSON.stringify({ 
                            action: "player_joined", 
                            player_id: playerId,
                            player_name: pName
                        }));
                    }

                    // نبضة الإجبار (Force Sync)
                    setTimeout(() => {
                        if (rooms[currentRoom] && rooms[currentRoom].players[playerId]) {
                            ws.send(JSON.stringify({ 
                                action: "game_update", 
                                // ✅ التعديل الحاسم: نرسل 1 لأن جودو يعتبر المضيف دائماً 1
                                player_id: 1, 
                                game_data: { type: "force_sync" }
                            }));
                        }
                    }, 500);

                } else {
                    console.log(`❌ [JOIN FAILED] محاولة دخول لغرفة غير موجودة: ${targetRoom}`);
                    ws.send(JSON.stringify({ 
                        action: "error", 
                        message: "⚠️ عذراً، كود الغرفة هذا غير موجود أو انتهت صلاحيته!" 
                    }));
                }
            }

            // 3️⃣ التمرير الدقيق والمباشر لحزم الـ WebRTC
            if (data.action === "game_update" && currentRoom && rooms[currentRoom]) {
                Object.keys(rooms[currentRoom].players).forEach((id) => {
                    if (id !== playerId) {
                        const targetPlayer = rooms[currentRoom].players[id];
                        if (targetPlayer && targetPlayer.ws.readyState === ws.OPEN) {
                            
                            // ✅ التعديل الحاسم: إذا كان المرسل هو المضيف، يجب أن يصل للضيف كأنه رقم 1
                            const senderIdForGodot = isHost ? 1 : playerId;

                            targetPlayer.ws.send(JSON.stringify({
                                action: "game_update",
                                player_id: senderIdForGodot,
                                game_data: data.game_data
                            }));
                        }
                    }
                });
            }

        } catch (error) {
            console.error("🚨 [SERVER ERROR] خطأ في معالجة البيانات القادمة:", error);
        }
    });

    // 4️⃣ معالجة انقطاع الاتصال (تنظيف الغرفة)
    ws.on('close', () => {
        console.log(`🔌 [DISCONNECTED] انقطع اتصال أحد الأجهزة.`);
        
        if (currentRoom && rooms[currentRoom]) {
            Object.keys(rooms[currentRoom].players).forEach((id) => {
                if (id !== playerId) {
                    const targetPlayer = rooms[currentRoom].players[id];
                    if (targetPlayer && targetPlayer.ws.readyState === ws.OPEN) {
                        targetPlayer.ws.send(JSON.stringify({ 
                            action: "player_left"
                        }));
                    }
                }
            });

            delete rooms[currentRoom].players[playerId];
            
            // تدمير الغرفة إذا خرج المضيف أو أصبحت فارغة
            if (Object.keys(rooms[currentRoom].players).length === 0 || rooms[currentRoom].host === playerId) {
                console.log(`🗑️ [ROOM CLEANUP] تم تنظيف وإغلاق الغرفة: ${currentRoom}`);
                delete rooms[currentRoom];
            }
        }
    });
});

server.listen(port, () => {
    console.log(`🚀 [VONE SERVER] يعمل بكفاءة مطلقة الآن على بورت: ${port}`);
});

