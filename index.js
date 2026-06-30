// ==============================================================================
// 🚀 index.js - سيرفر Node.js المطور والخفيف جداً للربط بين الهواتف على Render
// ==============================================================================
const { WebSocketServer } = require('ws');

// ريندر يحدد المنفذ تلقائياً عبر متغيرات البيئة، أو نستخدم 8910 محلياً
const PORT = process.env.PORT || 8910;
const wss = new WebSocketServer({ port: PORT });

// قاموس لتخزين اللاعبين المتصلين: { "اسم_اللاعب": socket }
const connectedPlayers = new Map();

console.log(`⚡ سيرفر Node.js يعمل بنجاح على المنفذ: ${PORT}`);

wss.on('connection', (ws) => {
    let registeredName = null;

    console.log('📱 هاتف جديد اتصل بالسيرفر...');

    // استقبال الرسائل القادمة من الهواتف
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.action) {
                // 📝 1. تسجيل اسم اللاعب فور دخوله اللعبة
                case 'register':
                    const playerName = data.name.trim().toLowerCase();
                    registeredName = playerName;
                    connectedPlayers.set(playerName, ws);
                    console.log(`✅ تم تسجيل اللاعب أونلاين: ${data.name}`);
                    break;

                // 📡 2. تمرير طلب الصداقة من هاتف (أ) إلى هاتف (ب)
                case 'send_request':
                    const targetName = data.target.trim().toLowerCase();
                    const senderName = data.sender;

                    console.log(`📩 طلب من [${senderName}] يبحث عن [${data.target}]`);

                    if (connectedPlayers.has(targetName)) {
                        const targetSocket = connectedPlayers.get(targetName);
                        // إرسال الطلب فوراً للمستقبل
                        targetSocket.send(JSON.stringify({
                            action: 'receive_request',
                            sender: senderName
                        }));
                        console.log(`🎯 تم العثور على الصديق وتوجيه الطلب إليه.`);
                    } else {
                        console.log(`⚠️ الصديق [${data.target}] غير متصل حالياً.`);
                        ws.send(JSON.stringify({ action: 'player_offline', target: data.target }));
                    }
                    break;

                // 🤝 3. دمج اللاعبين ونقلهما لغرفة اللعب فور ضغط زر (قبول)
                case 'bridge_players':
                    const p1 = data.target.trim().toLowerCase();
                    const p2 = data.sender.trim().toLowerCase();

                    if (connectedPlayers.has(p1) && connectedPlayers.has(p2)) {
                        const socketA = connectedPlayers.get(p1);
                        const socketB = connectedPlayers.get(p2);

                        const startSignal = JSON.stringify({ action: 'start_game_scene' });
                        
                        // أمر فوري للهاتفين معاً بالانتقال لغرفة اللعب
                        socketA.send(startSignal);
                        socketB.send(startSignal);
                        console.log(`🎮 تم دمج اللاعبين [${p1}] و [${p2}] في غرفة اللعب بنجاح!`);
                    }
                    break;
            }
        } catch (error) {
            console.error('❌ خطأ في معالجة البيانات القادمة:', error);
        }
    });

    // عند انقطاع اتصال الهاتف (إغلاق اللعبة أو ضعف الإنترنت)
    ws.on('close', () => {
        if (registeredName) {
            connectedPlayers.delete(registeredName);
            console.log(`🛑 اللاعب [${registeredName}] سجل خروجه من السيرفر.`);
        }
    });
});
