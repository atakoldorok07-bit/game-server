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

    console.log('🌐 [CONNECTION] جهاز جديد اتصل بالسيرفر الآن.');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log(`📥 [RECEIVED]:`, data);

            // 1️⃣ إنشاء غرفة جديدة (المضيف / Host)
            if (data.action === "create_room") {
                playerId = data.player_id;
                currentRoom = data.room_code;
                pName = data.player_name || "Host";

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
                
                // إرسال تأكيد فوري للمضيف بأن الغرفة مسجلة
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

                // التحقق من وجود الغرفة
                if (targetRoom && rooms[targetRoom]) {
                    currentRoom = targetRoom;
                    
                    // إضافة الضيف إلى قائمة لاعبي الغرفة
                    rooms[currentRoom].players[playerId] = { ws: ws, name: pName, id: playerId };
                    
                    console.log(`🤝 [JOIN SUCCESS] اللاعب [${pName}] انضم للغرفة: ${currentRoom}`);

                    const hostId = rooms[currentRoom].host;
                    const hostNode = rooms[currentRoom].players[hostId];

                    // [تأكيد فوري ودقيق للضيف]: أرسل له بيانات المضيف فوراً
                    ws.send(JSON.stringify({ 
                        action: "joined_success", 
                        room_code: currentRoom,
                        player_id: hostId,
                        player_name: hostNode ? hostNode.name : "Host"
                    }));

                    // [تأكيد فوري ودقيق للمضيف]: أخبره بدخول الضيف ليقوم بفتح اتصال الـ WebRTC
                    if (hostNode && hostNode.ws.readyState === ws.OPEN) {
                        hostNode.ws.send(JSON.stringify({ 
                            action: "player_joined", 
                            player_id: playerId,
                            player_name: pName
                        }));
                    }

                    /* 
                       🔥 التفصيل الدقيق الحاسم:
                       إجبار السيرفر على إرسال نبضة ربط إضافية بعد 500 ملي ثانية 
                       لضمان تحديث واجهة الهواتف وإظهار الشخصيات الاثنين حتى لو سقطت الحزمة الأولى!
                    */
                    setTimeout(() => {
                        if (rooms[currentRoom] && rooms[currentRoom].players[playerId]) {
                            ws.send(JSON.stringify({ 
                                action: "game_update", 
                                player_id: hostId,
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

            // 3️⃣ التمرير الدقيق والمباشر لحزم الـ WebRTC (Offers, Answers, Candidates)
            if (data.action === "game_update" && currentRoom && rooms[currentRoom]) {
                // إرسال البيانات لكل اللاعبين الآخرين في الغرفة باستثناء المرسل نفسه
                Object.keys(rooms[currentRoom].players).forEach((id) => {
                    if (id !== playerId) {
                        const targetPlayer = rooms[currentRoom].players[id];
                        if (targetPlayer && targetPlayer.ws.readyState === ws.OPEN) {
                            targetPlayer.ws.send(JSON.stringify({
                                action: "game_update",
                                player_id: playerId,
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
            // إعلام بقية اللاعبين برحيل هذا اللاعب
            Object.keys(rooms[currentRoom].players).forEach((id) => {
                if (id !== playerId) {
                    const targetPlayer = rooms[currentRoom].players[id];
                    if (targetPlayer && targetPlayer.ws.readyState === ws.OPEN) {
                        targetPlayer.ws.send(JSON.stringify({ 
                            action: "player_left", 
                            player_id: playerId 
                        }));
                    }
                }
            });

            // حذف اللاعب من الغرفة
            delete rooms[currentRoom].players[playerId];
            
            // إذا غادر المضيف أو أصبحت الغرفة فارغة تماماً، يتم تدميرها فوراً
            if (Object.keys(rooms[currentRoom].players).length === 0 || rooms[currentRoom].host === playerId) {
                console.log(`🗑️ [ROOM CLEANUP] تم تنظيف وإغلاق الغرفة: ${currentRoom}`);
                delete rooms[currentRoom];
            }
        }
    });
});

// تشغيل السيرفر على البورت المحدد
server.listen(port, () => {
    console.log(`🚀 [VONE SERVER] يعمل بكفاءة مطلقة الآن على بورت: ${port}`);
});
