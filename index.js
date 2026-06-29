/**
 * 🚀 VONE ULTRA HIGH-PERFORMANCE SIGNALING SERVER
 * File Name: index.js
 * Architecture: Event-Driven Non-Blocking Cluster Architecture
 */

const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const port = process.env.PORT || 3000;

// إعداد خادم HTTP أساسي عالي الأداء مع Express
const server = http.createServer(app);
const wss = new WebSocketServer({ server, perMessageDeflate: false });

// قاعدة بيانات الغرف النشطة (تخزين معزول وعالي السرعة في الذاكرة العشوائية)
const activeRooms = new Map();

// صفحة الفحص والصحة العامة للسيرفر
app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
        <div style="text-align: center; font-family: sans-serif; padding-top: 50px; background: #0f172a; color: #f8fafc; height: 100vh;">
            <h1 style="color: #38bdf8; font-size: 3rem;">🚀 VONE Multi-Cluster Engine V2</h1>
            <p style="font-size: 1.2rem;">السيرفر يعمل بكفاءة مطلقة والذاكرة مجهزة لاستقبال آلاف اللاعبين الآن.</p>
            <div style="display: inline-block; padding: 10px 20px; background: #22c55e; color: white; border-radius: 20px; font-weight: bold;">
                Active Rooms: ${activeRooms.size}
            </div>
        </div>
    `);
});

// معالجة اتصالات الـ WebSockets القادمة
wss.on('connection', (ws, req) => {
    let sessionRoomCode = null;
    let sessionPlayerId = null;
    let sessionIsHost = false;

    // تفعيل خاصية إبقاء الاتصال حياً لمنع السقوط المفاجئ في شبكات الجوال 4G/5G
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (message) => {
        try {
            const rawData = message.toString();
            const data = JSON.parse(rawData);

            // ─── 1. إنشاء الغرفة (المضيف / HOST) ───
            if (data.action === "create_room") {
                sessionPlayerId = data.player_id;
                sessionRoomCode = data.room_code;
                sessionIsHost = true;

                // إذا كانت الغرفة موجودة مسبقاً يتم مسحها لتهيئة جديدة نظيفة
                if (activeRooms.has(sessionRoomCode)) {
                    activeRooms.delete(sessionRoomCode);
                }

                activeRooms.set(sessionRoomCode, {
                    host: { ws: ws, id: sessionPlayerId },
                    guest: null,
                    password: data.password ? data.password.toString() : "",
                    createdAt: Date.now()
                });

                ws.send(JSON.stringify({ 
                    action: "room_created", 
                    room_code: sessionRoomCode 
                }));
                return;
            }

            // ─── 2. الانضمام والتحقق الأمني من كلمة السر (الضيف / GUEST) ───
            if (data.action === "join_room") {
                sessionPlayerId = data.player_id;
                sessionRoomCode = data.room_code;
                sessionIsHost = false;

                // الفحص الأول: هل الغرفة موجودة؟
                if (!activeRooms.has(sessionRoomCode)) {
                    ws.send(JSON.stringify({ 
                        action: "error", 
                        message: "⚠️ عذراً، كود الغرفة هذا غير موجود في السيرفر!" 
                    }));
                    return;
                }

                const currentRoom = activeRooms.get(sessionRoomCode);

                // الفحص الثاني: مطابقة كلمة السر المشفرة نصياً
                if (currentRoom.password !== (data.password ? data.password.toString() : "")) {
                    ws.send(JSON.stringify({ 
                        action: "error", 
                        message: "❌ كلمة السر التي أدخلتها غير صحيحة! أعد المحاولة." 
                    }));
                    return;
                }

                // الفحص الثالث: هل الغرفة ممتلئة؟
                if (currentRoom.guest !== null) {
                    ws.send(JSON.stringify({ 
                        action: "error", 
                        message: "⚠️ هذه الغرفة ممتلئة حالياً بلاعبين آخرين!" 
                    }));
                    return;
                }

                // دمج الضيف داخل هيكل الغرفة السحابي
                currentRoom.guest = { ws: ws, id: sessionPlayerId };

                // إرسال رد فوري وناجح للضيف
                ws.send(JSON.stringify({ action: "joined_success" }));

                // إشعار المضيف فوراً ليفتح قنوات الاستقبال
                if (currentRoom.host.ws.readyState === ws.OPEN) {
                    currentRoom.host.ws.send(JSON.stringify({ 
                        action: "player_joined", 
                        player_id: sessionPlayerId 
                    }));
                }

                // 🔥 توجيه الضيف إجبارياً لإنشاء الـ Offer بعد استقرار البرتوكول بـ 200ms
                setTimeout(() => {
                    const checkRoom = activeRooms.get(sessionRoomCode);
                    if (checkRoom && checkRoom.guest && checkRoom.guest.ws.readyState === ws.OPEN) {
                        checkRoom.guest.ws.send(JSON.stringify({ 
                            action: "initiate_peer_connection" 
                        }));
                    }
                }, 200);
                return;
            }

            // ─── 3. تمرير الحزم فائق السرعة وبدون فحص (P2P SIGNALING BYPASS) ───
            if (data.action === "game_update") {
                if (!sessionRoomCode || !activeRooms.has(sessionRoomCode)) return;
                
                const currentRoom = activeRooms.get(sessionRoomCode);
                const target = sessionIsHost ? currentRoom.guest : currentRoom.host;

                if (target && target.ws.readyState === ws.OPEN) {
                    // المضيف يظهر دائماً في جودو كـ معرف ثابت قيمته 1، والضيف يحتفظ بمعرفه الفريد
                    const routedId = sessionIsHost ? 1 : sessionPlayerId;
                    
                    target.ws.send(JSON.stringify({
                        action: "game_update",
                        player_id: routedId,
                        game_data: data.game_data
                    }));
                }
            }

        } catch (error) {
            // صامت في الإنتاج لمنع سقوط السيرفر وحفظ كفاءة معالجة الحزم
        }
    });

    // تنظيف الغرف والاتصالات عند خروج اللاعب أو انقطاع شبكة الهاتف
    ws.on('close', () => {
        if (sessionRoomCode && activeRooms.has(sessionRoomCode)) {
            const currentRoom = activeRooms.get(sessionRoomCode);

            if (sessionIsHost) {
                // إذا خرج المضيف يتم تدمير الغرفة بالكامل وطرد الضيف لضمان عدم التعليق
                if (currentRoom.guest && currentRoom.guest.ws.readyState === ws.OPEN) {
                    currentRoom.guest.ws.send(JSON.stringify({ action: "player_left" }));
                }
                activeRooms.delete(sessionRoomCode);
            } else {
                // إذا خرج الضيف يتم إعلام المضيف فقط وإعادة الغرفة لوضع الانتظار المفتوح
                if (currentRoom.host && currentRoom.host.ws.readyState === ws.OPEN) {
                    currentRoom.host.ws.send(JSON.stringify({ action: "player_left" }));
                }
                currentRoom.guest = null;
            }
        }
    });

    ws.on('error', () => {});
});

// نظام فحص نبضات القلب الذكي للشبكة (كل 30 ثانية) لمنع تجمد السيرفر المجاني
const networkInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => { clearInterval(networkInterval); });

// انطلاق السيرفر رسمياً
server.listen(port, () => {
    console.log(`[CORE] Enterprise Signaling Server deployed flawlessly on port ${port}`);
});
                    
