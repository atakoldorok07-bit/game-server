// ==============================================================================
// 🚀 index.js (المطور والمصحح لتخطي حظر الهاندشيك على Render المجاني)
// ==============================================================================
const http = require('http');
const { WebSocketServer } = require('ws');

// إنشاء سيرفر HTTP عادي لإقناع منصة Render بأن التطبيق متصل ومستيقظ
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('🎮 Game Server is Running Live!\n');
});

const PORT = process.env.PORT || 8910;
const wss = new WebSocketServer({ server }); // ربط المقابس بسيرفر الـ HTTP
const connectedPlayers = new Map();

console.log(`====================================================`);
console.log(`⚡ السيرفر المطور يعمل الآن بالبوابة الموحدة على المنفذ: ${PORT}`);
console.log(`====================================================`);

wss.on('connection', (ws) => {
    let registeredName = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (!data || !data.action) return;

            switch (data.action) {
                case 'register':
                    const playerName = data.name.trim().toLowerCase();
                    registeredName = playerName;
                    connectedPlayers.set(playerName, ws);
                    console.log(`✅ مسجل أونلاين: [${data.name}]`);
                    break;

                case 'send_request':
                    const targetName = data.target.trim().toLowerCase();
                    const senderName = data.sender;

                    if (connectedPlayers.has(targetName)) {
                        const targetSocket = connectedPlayers.get(targetName);
                        targetSocket.send(JSON.stringify({
                            action: 'receive_request',
                            sender: senderName
                        }));
                        
                        ws.send(JSON.stringify({
                            action: 'friend_found',
                            target: data.target
                        }));
                    } else {
                        ws.send(JSON.stringify({ 
                            action: 'player_offline' 
                        }));
                        console.log(`❌ الاسم [${data.target}] غير متصل.`);
                    }
                    break;

                case 'bridge_players':
                    const p1 = data.target.trim().toLowerCase();
                    const p2 = data.sender.trim().toLowerCase();

                    if (connectedPlayers.has(p1) && connectedPlayers.has(p2)) {
                        const socketA = connectedPlayers.get(p1);
                        const socketB = connectedPlayers.get(p2);
                        const startSignal = JSON.stringify({ action: 'start_game_scene' });
                        socketA.send(startSignal);
                        socketB.send(startSignal);
                    }
                    break;
            }
        } catch (error) {
            console.error(`🚨 خطأ معالجة:`, error.message);
        }
    });

    ws.on('close', () => {
        if (registeredName) {
            connectedPlayers.delete(registeredName);
            console.log(`🧹 غادر وتم مسحه: [${registeredName}]`);
        }
    });
});

// بدء الاستماع الفعلي للمنفذ المعين من ريندر
server.listen(PORT, () => {
    console.log(`📡 السيرفر يستقبل الاتصالات الحية الآن بنجاح وعبر الأمان.`);
});
