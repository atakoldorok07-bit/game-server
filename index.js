/**
 * 🚀 VONE ULTRA HIGH-PERFORMANCE SIGNALING SERVER (FIXED ARCHITECTURE)
 * File Name: index.js
 */

const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const port = process.env.PORT || 3000;

const server = http.createServer(app);
const wss = new WebSocketServer({ server, perMessageDeflate: false });

const activeRooms = new Map();

app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
        <div style="text-align: center; font-family: sans-serif; padding-top: 50px; background: #0f172a; color: #f8fafc; height: 100vh;">
            <h1 style="color: #38bdf8; font-size: 3rem;">🚀 VONE Multi-Cluster Engine V2.1 (Fixed)</h1>
            <p style="font-size: 1.2rem;">السيرفر يعمل بكفاءة وتم إصلاح مزامنة المعرفات العشوائية.</p>
            <div style="display: inline-block; padding: 10px 20px; background: #22c55e; color: white; border-radius: 20px; font-weight: bold;">
                Active Rooms: ${activeRooms.size}
            </div>
        </div>
    `);
});

wss.on('connection', (ws, req) => {
    let sessionRoomCode = null;
    let sessionPlayerId = null;
    let sessionIsHost = false;

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (message) => {
        try {
            const rawData = message.toString();
            const data = JSON.parse(rawData);

            // ─── 1. إنشاء الغرفة (HOST) ───
            if (data.action === "create_room") {
                sessionPlayerId = data.player_id;
                sessionRoomCode = data.room_code;
                sessionIsHost = true;

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

            // ─── 2. الانضمام والتحقق (GUEST) ───
            if (data.action === "join_room") {
                sessionPlayerId = data.player_id;
                sessionRoomCode = data.room_code;
                sessionIsHost = false;

                if (!activeRooms.has(sessionRoomCode)) {
                    ws.send(JSON.stringify({ action: "error", message: "⚠️ عذراً، كود الغرفة غير موجود!" }));
                    return;
                }

                const currentRoom = activeRooms.get(sessionRoomCode);

                if (currentRoom.password !== (data.password ? data.password.toString() : "")) {
                    ws.send(JSON.stringify({ action: "error", message: "❌ كلمة السر غير صحيحة!" }));
                    return;
                }

                if (currentRoom.guest !== null) {
                    ws.send(JSON.stringify({ action: "error", message: "⚠️ هذه الغرفة ممتلئة!" }));
                    return;
                }

                currentRoom.guest = { ws: ws, id: sessionPlayerId };

                // رد نجاح للضيف متضمناً رقم معرف المضيف الحقيقي
                ws.send(JSON.stringify({ 
                    action: "joined_success",
                    host_id: currentRoom.host.id 
                }));

                // إشعار المضيف بانضمام الضيف المعين
                if (currentRoom.host.ws.readyState === ws.OPEN) {
                    currentRoom.host.ws.send(JSON.stringify({ 
                        action: "player_joined", 
                        player_id: sessionPlayerId 
                    }));
                }

                // إجبار المزامنة البصرية فوراً
                if (currentRoom.host.ws.readyState === ws.OPEN) {
                    currentRoom.host.ws.send(JSON.stringify({ action: "lobby_sync_forced", guest_id: sessionPlayerId, host_id: currentRoom.host.id }));
                }
                ws.send(JSON.stringify({ action: "lobby_sync_forced", guest_id: sessionPlayerId, host_id: currentRoom.host.id }));

                // إطلاق الـ WebRTC لتبادل الـ Offer والـ Answer
                setTimeout(() => {
                    const checkRoom = activeRooms.get(sessionRoomCode);
                    if (checkRoom && checkRoom.guest && checkRoom.guest.ws.readyState === ws.OPEN) {
                        checkRoom.guest.ws.send(JSON.stringify({ 
                            action: "initiate_peer_connection",
                            host_id: checkRoom.host.id
                        }));
                    }
                }, 300);
                return;
            }

            // ─── 3. تمرير الحزم (FIXED P2P SIGNALING) ───
            if (data.action === "game_update") {
                if (!sessionRoomCode || !activeRooms.has(sessionRoomCode)) return;
                
                const currentRoom = activeRooms.get(sessionRoomCode);
                const target = sessionIsHost ? currentRoom.guest : currentRoom.host;

                if (target && target.ws.readyState === ws.OPEN) {
                    // [تعديل جوهري]: نمرر المعرف الحقيقي المرسل من جودوت دون فرض الرقم 1 كمعرف عشوائي سيء
                    target.ws.send(JSON.stringify({
                        action: "game_update",
                        player_id: data.player_id, 
                        game_data: data.game_data
                    }));
                }
            }

        } catch (error) {
            // صامت لحماية السيرفر
        }
    });

    ws.on('close', () => {
        if (sessionRoomCode && activeRooms.has(sessionRoomCode)) {
            const currentRoom = activeRooms.get(sessionRoomCode);
            if (sessionIsHost) {
                if (currentRoom.guest && currentRoom.guest.ws.readyState === ws.OPEN) {
                    currentRoom.guest.ws.send(JSON.stringify({ action: "player_left" }));
                }
                activeRooms.delete(sessionRoomCode);
            } else {
                if (currentRoom.host && currentRoom.host.ws.readyState === ws.OPEN) {
                    currentRoom.host.ws.send(JSON.stringify({ action: "player_left" }));
                }
                currentRoom.guest = null;
            }
        }
    });
});

const networkInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 25000);

wss.on('close', () => { clearInterval(networkInterval); });

server.listen(port, () => {
    console.log(`[CORE] Server updated and running on port ${port}`);
});
