// ==============================================================================
// 🚀 index.js (النسخة الموسعة للمراقبة الشاملة وفحص الأخطاء المعقدة)
// ==============================================================================
const { WebSocketServer } = require('ws');

// تحديد المنفذ الديناميكي ليتوافق مع منصات الاستضافة مثل ريندر بشكل آمن
const PORT = process.env.PORT || 8910;
const wss = new WebSocketServer({ port: PORT });

// خريطة لتخزين اللاعبين المتصلين حالياً (اسم اللاعب الحركي -> المقبس الخاص به)
const connectedPlayers = new Map();

console.log(`====================================================`);
console.log(`⚡ سيرفر الألعاب المطور يعمل بنجاح على المنفذ الحقيقي: ${PORT}`);
console.log(`📡 في انتظار اتصالات هواتف اللاعبين الفورية...`);
console.log(`====================================================`);

// بدء الاستماع لطلبات الاتصال الواردة من الهواتف والتطبيقات
wss.on('connection', (ws, req) => {
    let registeredName = null;
    const clientIp = req.socket.remoteAddress;
    
    console.log(`\n[اتصال جديد] تم رصد محاولة اتصال من العنوان النمطي: ${clientIp}`);

    // الاستماع للرسائل والحزم البرمجية القادمة من مقبس جودوت الصادر
    ws.on('message', (message) => {
        console.log(`----------------------------------------------------`);
        console.log(`📥 حزمة خام واردة للسيرفر: ${message}`);
        
        try {
            // تحويل النص الخام القادم من جودوت إلى كائن JSON برمجي
            const data = JSON.parse(message);
            
            // الفحص الأولي لضمان عدم إرسال حزم فارغة تسبب انهيار المقبس
            if (!data || !data.action) {
                console.log(`⚠️ تحذير: تم استلام حزمة برمجية مشوهة أو لا تحتوي على حقل [action]!`);
                return;
            }
            
            console.log(`🎯 الإجراء المطلوب تنفيذه حالياً هو: [${data.action}]`);

            switch (data.action) {
                
                // 1️⃣ حالة تسجيل اللاعب على السيرفر وحفظ حالته أونلاين
                case 'register':
                    if (!data.name) {
                        console.log(`❌ خطأ تسجيل: الحزمة المرسلة لا تحتوي على حقل الاسم الشخصي للاعب.`);
                        return;
                    }
                    
                    const playerName = data.name.trim().toLowerCase();
                    registeredName = playerName;
                    
                    // إدراج المقبس الحالي للاعب داخل قاعدة البيانات المؤقتة
                    connectedPlayers.set(playerName, ws);
                    
                    console.log(`✅ تم تسجيل اللاعب بنجاح: [${data.name}] وتحويل الاسم داخلياً إلى: (${playerName})`);
                    console.log(`📊 إجمالي عدد اللاعبين المتواجدين أونلاين الآن: ${connectedPlayers.size}`);
                    break;

                // 2️⃣ حالة البحث الحية وإرسال طلب الربط للطرف الآخر
                case 'send_request':
                    if (!data.target || !data.sender) {
                        console.log(`❌ خطأ فحص: حزمة البحث تفتقد لاسم المرسل أو اسم الصديق المستهدف.`);
                        return;
                    }

                    const targetName = data.target.trim().toLowerCase();
                    const senderName = data.sender;
                    
                    console.log(`🔍 اللاعب [${senderName}] يبحث عن صديقه المتصل: [${data.target}] (الاسم البرمجي: ${targetName})`);

                    // التحقق الصارم: هل الصديق المستهدف متصل حالياً بقاعدة البيانات؟
                    if (connectedPlayers.has(targetName)) {
                        console.log(`🎯 ممتاز! تم العثور على الصديق [${data.target}] أونلاين في السيرفر.`);
                        
                        const targetSocket = connectedPlayers.get(targetName);
                        
                        // إرسال إشارة للمستقبل تخبره بوجود طلب صداقة وتحدي وارد له
                        targetSocket.send(JSON.stringify({
                            action: 'receive_request',
                            sender: senderName
                        }));
                        console.log(`✈️ تم توجيه طلب الاقتران بنجاح إلى شاشة اللاعب: [${data.target}]`);
                        
                        // الرد الفوري المباشر على هاتف المرسل لإيقاف دوران الدائرة وفتح واجهة ed_1
                        ws.send(JSON.stringify({
                            action: 'friend_found',
                            target: data.target
                        }));
                        console.log(`📨 تم إرسال إشارة التأكيد (friend_found) للمرسل لإغلاق دائرة التحميل.`);
                    } else {
                        // كسر حالة التوقف اللانهائي: الصديق أوفلاين، نرسل فوراً رد النفي للهاتف
                        console.log(`❌ فشل العثور: الاسم المستهدف [${data.target}] غير متصل حالياً بالسيرفر.`);
                        
                        ws.send(JSON.stringify({ 
                            action: 'player_offline' 
                        }));
                        console.log(`📣 تم إرسال نبضة الرفض (player_offline) للمرسل ليعلم فوراً أن الاسم غير موجود.`);
                    }
                    break;

                // 3️⃣ حالة القبول وبدء الدمج الفوري بين اللاعبين لدخول الغرفة المشتركة
                case 'bridge_players':
                    if (!data.target || !data.sender) {
                        console.log(`❌ خطأ دمج: حزمة الربط والدمج تفتقد لبيانات الهويات الأساسية للطرفين.`);
                        return;
                    }

                    const p1 = data.target.trim().toLowerCase();
                    const p2 = data.sender.trim().toLowerCase();
                    
                    console.log(`🤝 محاولة دمج وبناء جسر اتصال بين اللاعبين: (${p1}) و (${p2})`);

                    // التأكد من أن الطرفين لا يزالان متصلين ولم يخرج أحدهما أثناء الانتظار
                    if (connectedPlayers.has(p1) && connectedPlayers.has(p2)) {
                        const socketA = connectedPlayers.get(p1);
                        const socketB = connectedPlayers.get(p2);
                        
                        const startSignal = JSON.stringify({ 
                            action: 'start_game_scene' 
                        });
                        
                        // إرسال نبضة الانطلاق المتزامنة للهاتفين معاً لتغيير المشهد في نفس اللحظة
                        socketA.send(startSignal);
                        socketB.send(startSignal);
                        
                        console.log(`🚀 تمت عملية الدمج بنجاح قاطع! تم إرسال نبضة بدء اللعبة والتحويل للغرفة المشتركة.`);
                    } else {
                        console.log(`⚠️ تعذر الدمج الفوري: أحد اللاعبين أو كلاهما غادر المقبس بشكل مفاجئ.`);
                    }
                    break;
                
                // التعامل مع أي إجراءات عشوائية أو غير معروفة للمنظومة
                default:
                    console.log(`❓ إجراء غير مدعوم أو مجهول تم رصده في السيرفر: [${data.action}]`);
                    break;
            }
            
        } catch (error) {
            // التقاط وفحص أخطاء المعالجة وفك شفرات الـ JSON
            console.error(`🚨 خطأ برمجي داخلي في معالجة البيانات بالسيرفر:`, error.message);
        }
        console.log(`----------------------------------------------------`);
    });

    // الاستماع لحالة فصل التيار أو إغلاق اللاعب للعبة أو قطع شبكة الهاتف
    ws.on('close', (code, reason) => {
        console.log(`\n[قطع الاتصال] غادر مقبس من السيرفر. الكود: ${code} | السبب: ${reason || 'لا يوجد'}`);
        
        if (registeredName) {
            // إزالة اسم اللاعب فوراً من الـ Map لكي لا يبحث عنه أحد وهو خارج اللعبة
            connectedPlayers.delete(registeredName);
            console.log(`🧹 تم تنظيف السيرفر وإزالة الاسم المخزن: [${registeredName}] من خريطة النشاط الحية.`);
            console.log(`📊 إجمالي عدد اللاعبين المتواجدين أونلاين المتبقين: ${connectedPlayers.size}`);
        }
    });

    // رصد الأخطاء المباشرة الخاصة بشبكة المقابس والإنترنت لمنع الانهيار المفاجئ للعملية كاملة
    ws.on('error', (err) => {
        console.error(`🚨 خطأ مقبس شبكي حرج (Socket Error) تم رصده:`, err.message);
    });
});
