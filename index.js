// ==============================================================================
// 🌐 index.js - النسخة الاحترافية الكاملة المدمجة لنظام الغرف والمطابقة أونلاين
// ==============================================================================
const http = require('http');
const WebSocket = require('ws');

// 1. تحديد المنفذ ديناميكيًا لقراءة إعدادات منصة Render بشكل صحيح
const PORT = process.env.PORT || 8080;

// 2. إنشاء سيرفر HTTP أساسي لتخطي فحص الحالة (Health Check) الخاص بـ Render
const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('🟢 سيرفر ألعاب Godot المطور يعمل بكفاءة أونلاين!');
    } else {
        res.writeHead(404);
        res.end();
    }
});

// 3. إنشاء مقبس الـ WebSocket وربطه مباشرة بسيرفر الـ HTTP
const wss = new WebSocket.Server({ server: server });

// جداول حفظ بيانات اللاعبين والغرف النشطة في الذاكرة
const players = new Map();       // لربط اسم اللاعب بـ الـ Socket الخاص به
const rooms = new Map();         // لحفظ الغرف: room_code -> البيانات
let matchmakingQueue = [];       // طابور الانتظار للغرف العشوائية (Matchmaking)

console.log(`=======================================================`);
console.log(`🚀 السيرفر العالمي الموحد يعمل الآن بنجاح على المنفذ: ${PORT}`);
console.log(`=======================================================`);

wss.on('connection', (ws) => {
    let currentPlayerName = "";
    console.log("📡 اتصال جديد قادم من أحد الهواتف...");

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const action = data.action;

            switch (action) {
                
                // 1️⃣ تسجيل اللاعب بربط اسمه بالاتصال الخاص به
                case 'register':
                    if (data.name && data.name.trim() !== "") {
                        currentPlayerName = data.name.trim();
                        players.set(currentPlayerName, ws);
                        console.log(`✅ تم تسجيل اللاعب بنجاح: ${currentPlayerName}`);
                    }
                    break;

                // 2️⃣ إنشاء غرفة جديدة (يدوية أو عشوائية Matchmaking)
                case 'create_room':
                    const roomCode = data.room_code;
                    const roomType = data.room_type || "Public";
                    const creator = data.creator_name;

                    if (!roomCode) break;

                    // حفظ بيانات الغرفة في السيرفر
                    rooms.set(roomCode, {
                        creator: creator,
                        type: roomType,
                        players: [creator],
                        status: "waiting"
                    });

                    console.log(`⚙️ تم فتح غرفة برمز: [${roomCode}] نوع: ${roomType} بواسطة: ${creator}`);
                    
                    // إذا كانت الغرفة مخصصة للمطابقة العشوائية، نضعها في طابور الانتظار
                    if (roomType === "Matchmaking") {
                        matchmakingQueue.push(roomCode);
                    }
                    break;

                // 3️⃣ البحث التلقائي العشوائي عن الغرف (Matchmaking - ed_2)
                case 'matchmaking':
                    const seeker = data.sender_name;
                    console.log(`🔍 اللاعب [${seeker}] يبحث عن مواجهة عشوائية...`);

                    // تنظيف طابور الانتظار من الغرف الوهمية أو المغلقة
                    matchmakingQueue = matchmakingQueue.filter(code => rooms.has(code));

                    if (matchmakingQueue.length > 0) {
                        // جلب أول غرفة في الطابور للمطابقة
                        const targetRoomCode = matchmakingQueue.shift();
                        const room = rooms.get(targetRoomCode);

                        if (room && room.creator !== seeker) {
                            room.players.push(seeker);
                            room.status = "playing";

                            // إبلاغ اللاعب الذي يبحث بنجاح العثور على الغرفة المستهدفة
                            ws.send(JSON.stringify({
                                action: "friend_found",
                                target: room.creator
                            }));

                            // ربط الاسمين وتحديث بيانات الاتصال للطرف الآخر
                            const creatorSocket = players.get(room.creator);
                            if (creatorSocket) {
                                creatorSocket.send(JSON.stringify({
                                    action: "receive_request",
                                    sender: seeker
                                }));
                            }
                            console.log(`🎮 تمت المطابقة بنجاح! اللاعب [${seeker}] انضم لغرفة [${room.creator}]`);
                        } else {
                            ws.send(JSON.stringify({ action: "room_not_found" }));
                        }
                    } else {
                        // لا توجد غرف متاحة حالياً، نبلغ الواجهة بـ Room Not Found ليتصرف السكريبت
                        ws.send(JSON.stringify({
                            action: "room_not_found",
                            reason: "No available rooms"
                        }));
                    }
                    break;

                // 4️⃣ طلب انضمام لاعب لغرفة معينة باسمها أو كودها (ed_3)
                case 'send_request':
                    const targetFriend = data.target;
                    const senderName = data.sender;

                    console.log(`📡 طلب اتصال يدوي من [${senderName}] إلى [${targetFriend}]`);

                    // الفحص: هل توجد غرفة مسجلة باسم هذا الصديق أو الكود؟
                    let foundRoomCode = null;
                    for (let [code, rDetails] of rooms.entries()) {
                        if (code === targetFriend || rDetails.creator === targetFriend) {
                            foundRoomCode = code;
                            break;
                        }
                    }

                    if (foundRoomCode) {
                        const targetSocket = players.get(targetFriend);
                        
                        // إرسال نجاح العثور للاعب المنضم لتشغيل دالة _on_join_success()
                        ws.send(JSON.stringify({
                            action: "friend_found",
                            target: targetFriend
                        }));

                        // إعلام الطرف الآخر بطلب التوصيل
                        if (targetSocket) {
                            targetSocket.send(JSON.stringify({
                                action: "receive_request",
                                sender: senderName
                            }));
                        }
                    } else {
                        // إرسال فشل العثور لتشغيل دالة _on_join_failed() وإظهار لوحة الـ Error
                        ws.send(JSON.stringify({ action: "room_not_found" }));
                    }
                    break;

                // 5️⃣ الربط النهائي وبدء تشغيل المشهد لكلا الهاتفين (bridge_players)
                case 'bridge_players':
                    const p1 = data.sender; // الشخص الموافق
                    const p2 = data.target; // الشخص المستهدف

                    const s1 = players.get(p1);
                    const s2 = players.get(p2);

                    const finalPayload = { action: "start_game_scene" };

                    if (s1) s1.send(JSON.stringify(finalPayload));
                    if (s2) s2.send(JSON.stringify(finalPayload));
                    
                    console.log(`⚡ تم ربط اللاعبين بنجاح وجاري نقلهم لمشهد اللعبة: ${p1} ⚔️ ${p2}`);
                    break;
            }

        } catch (e) {
            console.error("⚠️ خطأ في معالجة الحزمة النصية الواردة:", e.message);
        }
    });

    // إدارة انقطاع الاتصال المفاجئ من الهواتف لتنظيف السيرفر ومنع تعليق الذاكرة
    ws.on('close', () => {
        if (currentPlayerName !== "") {
            console.log(`❌ غادر اللاعب السيرفر: ${currentPlayerName}`);
            players.delete(currentPlayerName);

            // حذف أي غرف كان قد أنشأها لمنع دخول لاعبين لغرف وهمية
            for (let [code, room] of rooms.entries()) {
                if (room.creator === currentPlayerName) {
                    rooms.delete(code);
                    matchmakingQueue = matchmakingQueue.filter(c => c !== code);
                    console.log(`🧹 تم تنظيف وإغلاق الغرفة المهجورة: ${code}`);
                }
            }
        }
    });
});

// 4. بدء الإنصات والاستماع على المنفذ المحدد من ريندر
server.listen(PORT, () => {
    console.log(`🟢 [حالة ممتازة] السيرفر الموحد يستقبل الاتصالات الآن بسلام.`);
});
                        
