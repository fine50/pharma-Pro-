import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, getDoc, setDoc, doc, updateDoc, deleteDoc, query, where, orderBy, onSnapshot, serverTimestamp, writeBatch, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ============================================================
// 1. إعدادات المشروع
// ============================================================
const firebaseConfig = {
    apiKey: "AIzaSyDKuuVspUv3_IzjxQFMqG-2JucCkgt4pvY",
    authDomain: "pharma-45f21.firebaseapp.com",
    databaseURL: "https://pharma-45f21-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "pharma-45f21",
    storageBucket: "pharma-45f21.firebasestorage.app",
    messagingSenderId: "81580143218",
    appId: "1:81580143218:web:1b15394de65f0bf00308eb",
    measurementId: "G-TN72JS14PE"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app); 
const db = getFirestore(app);

// ============================================================
// 2. ستايل ولودر التحميل
// ============================================================
const styleSheet = document.createElement("style");
styleSheet.innerText = `
    @keyframes pulseAttention {
        0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.7); }
        70% { transform: scale(1.02); box-shadow: 0 0 0 10px rgba(245, 158, 11, 0); }
        100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
    }
    .btn-attention {
        animation: pulseAttention 2s infinite;
        background: linear-gradient(45deg, #f59e0b, #d97706);
        color: white; border: none; cursor: pointer !important; position: relative; z-index: 10;
    }
    .btn-attention:active { transform: scale(0.95); animation: none; }
    #globalLoader { position: fixed; inset: 0; background: #f8fafc; z-index: 99999; display: flex; justify-content: center; align-items: center; transition: opacity 0.3s; }
`;
document.head.appendChild(styleSheet);

const loaderDiv = document.createElement('div');
loaderDiv.id = 'globalLoader';
loaderDiv.innerHTML = '<div class="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-green-600"></div>';
document.body.appendChild(loaderDiv);

function hideLoader() {
    const loader = document.getElementById('globalLoader');
    if(loader) { loader.style.opacity = '0'; setTimeout(() => { if(loader.parentNode) loader.parentNode.removeChild(loader); }, 300); }
}

// ============================================================
// 3. التحقق من الصلاحيات (Auth Logic)
// ============================================================
const isDashPage = document.getElementById('ordersList'); 
const isLoginPage = document.getElementById('sellerLoginBtn');

if (!isDashPage && !isLoginPage) hideLoader();

onAuthStateChanged(auth, async (user) => {
    // 1. نحن في صفحة الدخول (login)
    if (isLoginPage) {
        if (user) {
            try {
                // نتحقق مما إذا كان المستخدم مفعلاً
                const docSnap = await getDoc(doc(db, "pharmacists", user.uid));
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.isVerified === true && !data.isBlocked) {
                        window.location.href = "dash.html"; 
                    } else {
                        await signOut(auth); // غير مفعل -> خروج
                        hideLoader();
                    }
                } else { 
                    await signOut(auth); 
                    hideLoader(); 
                }
            } catch (e) { 
                await signOut(auth); 
                hideLoader(); 
            }
        } else { 
            hideLoader(); 
        }
        return;
    }

    // 2. نحن في صفحة الداشبورد
    if (isDashPage) {
        if (user) {
            try {
                const docSnap = await getDoc(doc(db, "pharmacists", user.uid));
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.isVerified === true && !data.isBlocked) {
                        initDashboard(user); 
                    } else {
                        throw new Error("حساب غير مفعل");
                    }
                } else { throw new Error("لا توجد بيانات"); }
            } catch (error) {
                console.error("Auth:", error);
                await signOut(auth);
                window.location.href = "seller-login.html"; // تأكد من أن اسم الملف صحيح
            }
        } else {
            window.location.href = "seller-login.html";
        }
    }
});

// ============================================================
// 4. دالة استخراج اسم المدينة (آمنة وضد التعليق)
// ============================================================
async function getCityNameFromLink(gpsLink) {
    // إذا الرابط فارغ، ارجع فوراً
    if (!gpsLink) return "غير محدد";

    // استخراج الإحداثيات
    let lat, lng;
    try {
        if (gpsLink.includes("q=")) {
            const parts = gpsLink.split("q=")[1].split(",");
            lat = parts[0]; lng = parts[1];
        } else if (gpsLink.includes("@")) {
            const parts = gpsLink.split("@")[1].split(",");
            lat = parts[0]; lng = parts[1];
        } else if (gpsLink.includes(",")) {
            const parts = gpsLink.split(",");
            if(parts.length >= 2) { lat = parts[0].trim(); lng = parts[1].trim(); }
        }
    } catch(e) { return "رابط الموقع"; }

    if (!lat || !lng) return "رابط الموقع";

    // المحاولة الآمنة: نستخدم Promise.race لعمل "مؤقت"
    // إذا تأخر الطلب أكثر من 2000 ميلي ثانية (2 ثانية)، سنلغيه ونكمل بدونه
    const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => resolve("TIMEOUT"), 2000); 
    });

    try {
        const fetchPromise = fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&accept-language=ar`);
        
        // السباق: أيهما ينتهي أولاً (جلب البيانات أو المؤقت)
        const result = await Promise.race([fetchPromise, timeoutPromise]);

        if (result === "TIMEOUT") {
            console.warn("تجاوزنا جلب الاسم بسبب البطء");
            return "موقع GPS"; // تعذر الجلب بسبب الوقت
        }

        if (!result.ok) throw new Error("Network error");

        const data = await result.json();
        const city = data.address.state || data.address.city || data.address.town || "";
        const sub = data.address.suburb || data.address.county || "";
        
        return sub ? `${city} - ${sub}` : city;

    } catch (error) {
        console.warn("فشل جلب اسم المدينة:", error);
        return "موقع GPS"; // في حال الخطأ نرجع نصاً افتراضياً ولا نوقف البرنامج
    }
}

// ============================================================
// 5. الوظائف المساعدة (نجوم، صور، وقت)
// ============================================================
window.getStarRatingHTML = (rating) => {
    const r = parseFloat(rating) || 0;
    const fullStars = Math.floor(r);
    let html = '';
    for(let i=0; i<5; i++) {
        html += i < fullStars ? '<span class="text-yellow-400">★</span>' : '<span class="text-gray-200">★</span>';
    }
    return `<div class="flex text-sm tracking-tighter">${html} <span class="text-[10px] text-gray-400 mr-1 pt-1">(${r.toFixed(1)})</span></div>`;
};

window.markRequestAsTaken = async (requestId) => {
    if(!requestId) return;
    try {
        const reqRef = doc(db, "requests", requestId);
        const docSnap = await getDoc(reqRef);
        if (docSnap.exists() && !docSnap.data().expiresAt) {
            const expiryDate = new Date(); expiryDate.setHours(expiryDate.getHours() + 48); 
            await updateDoc(reqRef, { expiresAt: expiryDate, interactionStarted: true });
        }
    } catch (e) { console.error(e); }
};

// منطق التقييم
let currentReviewPharmaId = null; let currentRating = 0;
window.openReviewModal = (pharmaId, name, wilaya) => {
    currentReviewPharmaId = pharmaId;
    const modal = document.getElementById('reviewModal');
    if(modal) {
        document.getElementById('reviewSellerName').innerText = name;
        document.getElementById('reviewSellerWilaya').innerText = wilaya;
        window.setStars(0);
        modal.classList.remove('hidden'); modal.classList.add('flex');
        setTimeout(() => modal.classList.add('active'), 10);
    }
};
window.closeReviewModal = () => {
    const modal = document.getElementById('reviewModal');
    modal.classList.remove('active');
    setTimeout(() => { modal.classList.remove('flex'); modal.classList.add('hidden'); }, 300);
};
window.setStars = (n) => {
    currentRating = n;
    document.querySelectorAll('#starContainer span').forEach((s, i) => {
        s.style.color = i < n ? '#f97316' : '#e2e8f0';
        s.style.transform = i < n ? 'scale(1.2)' : 'scale(1)';
    });
};
window.submitReview = async () => {
    if(currentRating === 0) return alert("الرجاء اختيار النجوم");
    const text = document.getElementById('reviewText').value;
    try {
        const pharmaRef = doc(db, "pharmacists", currentReviewPharmaId);
        await runTransaction(db, async (t) => {
            const p = await t.get(pharmaRef);
            if(!p.exists()) throw "Error";
            const d = p.data();
            const newCount = (d.reviewCount || 0) + 1;
            const newRating = ((d.rating || 0) * (d.reviewCount || 0) + currentRating) / newCount;
            t.update(pharmaRef, { rating: newRating, reviewCount: newCount });
            t.set(doc(collection(db, "reviews")), { pharmaId: currentReviewPharmaId, pharmaName: d.shopName, stars: currentRating, text: text, createdAt: serverTimestamp() });
        });
        alert("تم إرسال التقييم بنجاح"); window.closeReviewModal();
    } catch(e) { alert("خطأ في التقييم"); }
};

window.openLightbox = (src) => {
    const box = document.getElementById('imgLightbox');
    const img = document.getElementById('lightboxImg');
    if(box && img) { img.src = src; box.classList.remove('hidden'); }
};

function timeAgo(t) {
    if(!t) return "";
    const s = Math.floor((new Date() - t.toDate())/1000);
    if(s>86400) return Math.floor(s/86400) + " يوم";
    if(s>3600) return Math.floor(s/3600) + " س";
    if(s>60) return Math.floor(s/60) + " د";
    return "الآن";
}

const compressImage = (file) => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image(); img.src = e.target.result;
            img.onload = () => {
                const cvs = document.createElement('canvas');
                const scale = 800 / img.width;
                cvs.width = img.width > 800 ? 800 : img.width;
                cvs.height = img.width > 800 ? img.height * scale : img.height;
                cvs.getContext('2d').drawImage(img, 0, 0, cvs.width, cvs.height);
                resolve(cvs.toDataURL('image/jpeg', 0.6));
            };
        };
    });
};

// ============================================================
// 6. منطق طلب الدواء (صفحة المريض)
// ============================================================
if (document.getElementById('medImage')) {
    let uploadedImageBase64 = null;
    document.getElementById('medImage').addEventListener('change', async (e) => {
        if (e.target.files[0]) {
            document.getElementById('imagePreview').src = URL.createObjectURL(e.target.files[0]);
            document.getElementById('imagePreview').classList.remove('hidden');
            document.getElementById('uploadPlaceholder').classList.add('hidden');
            uploadedImageBase64 = await compressImage(e.target.files[0]);
        }
    });

    document.getElementById('submitBtn').addEventListener('click', async () => {
        const btn = document.getElementById('submitBtn');
        const medName = document.getElementById('medName').value;
        const phone = document.getElementById('phoneNumber').value;
        
        if(!phone) return alert("رقم الهاتف ضروري");
        if(!medName && !uploadedImageBase64) return alert("أدخل اسم الدواء أو صورته");
        
        btn.innerText = "جاري الإرسال..."; btn.disabled = true;
        try {
            const code = Math.floor(1000 + Math.random() * 9000).toString();
            await addDoc(collection(db, "requests"), {
                medName: medName || "وصفة طبية", wilaya: document.getElementById('wilaya').value, 
                notes: document.getElementById('notes').value, phoneNumber: phone, 
                imageUrl: uploadedImageBase64, secretCode: code, status: "active", createdAt: serverTimestamp()
            });
            document.getElementById('formScreen').classList.add('hidden');
            document.getElementById('successScreen').classList.remove('hidden');
            document.getElementById('successScreen').classList.add('flex');
            document.getElementById('secretCodeDisplay').innerText = code;
        } catch(e) { alert("خطأ، حاول مرة أخرى"); btn.disabled = false; btn.innerText = "إرسال الطلب"; }
    });
}

// ============================================================
// 7. منطق التتبع
// ============================================================
const trackBtn = document.getElementById('trackBtn');
if (trackBtn) {
    trackBtn.addEventListener('click', async () => {
        const phone = document.getElementById('trackPhone').value.trim();
        const code = document.getElementById('trackCode').value.trim();
        if(!phone || !code) return alert("أدخل البيانات");
        
        trackBtn.innerText = "جاري البحث...";
        onSnapshot(query(collection(db, "requests"), where("phoneNumber", "==", phone), where("secretCode", "==", code)), (snap) => {
            if(snap.empty) { alert("لم يتم العثور على الطلب"); trackBtn.innerText = "عرض النتائج"; return; }
            const req = snap.docs[0];
            
            document.getElementById('loginSection').classList.add('hidden');
            document.getElementById('dashboardSection').classList.remove('hidden');
            document.getElementById('orderTitle').innerText = req.data().medName;

            onSnapshot(query(collection(db, "responses"), where("requestId", "==", req.id)), (respSnap) => {
                const list = document.getElementById('offersList'); list.innerHTML = "";
                if(respSnap.empty) { list.innerHTML = `<div class="bg-slate-50 p-8 text-center text-gray-400 rounded-2xl border border-dashed">لا توجد ردود بعد</div>`; return; }
                
                respSnap.forEach(d => {
                    const r = d.data();
                    list.innerHTML += `
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm mb-4">
                        <div class="flex justify-between">
                            <h3 class="font-bold text-slate-800">${r.pharmaName}</h3>
                            <span class="text-green-600 font-bold text-xs bg-green-50 px-2 py-1 rounded">متوفر</span>
                        </div>
                        <div class="text-xs text-gray-500 mt-1 mb-3">
                            📍 الموقع: <span class="font-semibold text-slate-700">${r.wilaya || "غير محدد"}</span>
                        </div>
                        ${r.notes ? `<div class="bg-slate-50 p-2 text-xs mb-3 text-slate-600 border rounded">💬 ${r.notes}</div>` : ''}
                        <div class="grid grid-cols-2 gap-2 mb-3">
                            <a href="tel:${r.phone}" onclick="window.markRequestAsTaken('${r.requestId}')" class="bg-gray-100 py-2 text-center rounded text-xs font-bold hover:bg-gray-200">📞 اتصال</a>
                            ${r.gpsLink ? `<a href="${r.gpsLink}" target="_blank" onclick="window.markRequestAsTaken('${r.requestId}')" class="bg-blue-50 text-blue-600 py-2 text-center rounded text-xs font-bold hover:bg-blue-100">🗺️ فتح الخريطة</a>` : ''}
                        </div>
                        <button onclick="window.openReviewModal('${r.pharmaId}', '${r.pharmaName}', '${r.wilaya}')" class="w-full py-2 bg-orange-50 text-orange-600 font-bold rounded text-xs hover:bg-orange-100">⭐ تقييم الصيدلية</button>
                    </div>`;
                });
            });
        });
    });
}

// ============================================================
// 8. منطق تسجيل الدخول وإنشاء الحساب (المنقح والمصلح)
// ============================================================
const sellerLoginBtn = document.getElementById('sellerLoginBtn');
if (sellerLoginBtn) {
    
    // --- (أ) تسجيل الدخول ---
    sellerLoginBtn.addEventListener('click', async () => {
        const email = document.getElementById('loginEmail').value;
        const pass = document.getElementById('loginPassword').value;
        if(!email || !pass) return alert("أدخل البيانات");
        
        sellerLoginBtn.innerText = "جاري التحقق..."; sellerLoginBtn.disabled = true;

        try {
            const u = await signInWithEmailAndPassword(auth, email, pass);
            
            const snap = await getDoc(doc(db, "pharmacists", u.user.uid));
            if(snap.exists()) {
                const d = snap.data();
                if(!d.isVerified) {
                    await signOut(auth);
                    alert("⚠️ حسابك قيد المراجعة.\nيرجى الانتظار حتى تقوم الإدارة بتفعيل حسابك.");
                    sellerLoginBtn.innerText = "دخول للوحة التحكم"; sellerLoginBtn.disabled = false;
                    return;
                }
                if(d.isBlocked) {
                    await signOut(auth);
                    alert("⛔ حسابك محظور.");
                    sellerLoginBtn.innerText = "دخول للوحة التحكم"; sellerLoginBtn.disabled = false;
                    return;
                }
            } else {
                 // حالة نادرة: مسجل في Auth ولكن غير موجود في Firestore
                 await signOut(auth);
                 alert("خطأ في بيانات الحساب");
                 sellerLoginBtn.innerText = "دخول للوحة التحكم"; sellerLoginBtn.disabled = false;
            }
        } catch(e) {
            console.error(e);
            let msg = "خطأ في البريد أو كلمة السر";
            if(e.code === 'auth/invalid-credential') msg = "المعلومات غير صحيحة";
            alert(msg);
            sellerLoginBtn.innerText = "دخول للوحة التحكم"; sellerLoginBtn.disabled = false;
        }
    });

    // --- (ب) إنشاء حساب جديد (حل مشكلة التعليق نهائياً) ---
    const authBtn = document.getElementById('authBtn');
    if (authBtn) {
        authBtn.addEventListener('click', async () => {
            const btn = document.getElementById('authBtn');
            const email = document.getElementById('email').value;
            const pass = document.getElementById('password').value;
            const shopName = document.getElementById('shopName').value;
            const phone = document.getElementById('phone').value;
            
            // قراءة القيمة من الحقل المخفي الذي ملأه زر GPS في الـ HTML
            const gpsLink = document.getElementById('gpsLink').value; 

            // التحقق من أن جميع البيانات موجودة بما فيها الموقع
            if(!shopName || !phone || !gpsLink || !email || !pass) {
                return alert("🛑 تنبيه:\nيجب الضغط على الزر الأزرق (تحديد موقع الصيدلية) أولاً، وملء جميع الحقول.");
            }
            if(pass.length < 6) return alert("كلمة المرور يجب أن تكون 6 أحرف على الأقل");

            btn.innerText = "جاري إنشاء الحساب..."; 
            btn.disabled = true;

            try {
                // 1. محاولة جلب الاسم (مع Timeout لمدة 2 ثانية فقط لتجنب التعليق)
                // إذا فشل، سيعود بكلمة "موقع GPS" ويكمل العملية
                const locationName = await getCityNameFromLink(gpsLink);

                // 2. إنشاء الحساب في Authentication
                const cred = await createUserWithEmailAndPassword(auth, email, pass);
                
                // 3. حفظ البيانات في Firestore
                await setDoc(doc(db, "pharmacists", cred.user.uid), {
                    shopName: shopName,
                    phone: phone,
                    email: email, 
                    gpsLink: gpsLink,        
                    wilaya: locationName,    
                    isVerified: false,      
                    isBlocked: false, 
                    rating: 0, 
                    reviewCount: 0, 
                    createdAt: serverTimestamp()
                });

                // 4. خروج فوري
                await signOut(auth);

                // 5. رسالة النجاح
                alert(`✅ تم إرسال طلبك بنجاح!
                
مرحباً: ${shopName}
تم تسجيل الموقع: ${locationName}

حسابك الآن قيد المراجعة من قبل فريق الدعم الفني.
سيتم تفعيل الحساب قريباً.`);
                
                window.location.reload();

            } catch(e) { 
                console.error(e);
                let msg = "حدث خطأ: " + e.message;
                if(e.code === 'auth/email-already-in-use') msg = "البريد الإلكتروني مسجل مسبقاً!";
                
                alert(msg);
                btn.innerText = "إنشاء حساب جديد"; 
                btn.disabled = false;
            }
        });
    }

    // --- استعادة كلمة السر ---
    const btnReset = document.getElementById('btnSendReset');
    if(btnReset) {
        btnReset.addEventListener('click', async () => {
            const mail = document.getElementById('forgotEmail').value;
            if(!mail) return alert("اكتب الإيميل");
            try { await sendPasswordResetEmail(auth, mail); alert("تم الإرسال"); window.closeForgotModal(); }
            catch(e) { alert("خطأ في الإرسال"); }
        });
    }
}

// ============================================================
// 9. لوحة التحكم (Dashboard)
// ============================================================
let currentPharmaData = null;

async function initDashboard(user) {
    const pharmaId = user.uid;
    
    // مراقبة الملف الشخصي
    onSnapshot(doc(db, "pharmacists", pharmaId), (snap) => {
        if(snap.exists()) {
            currentPharmaData = snap.data();
            
            if(!currentPharmaData.isVerified || currentPharmaData.isBlocked) {
                alert("تم إيقاف الحساب."); signOut(auth).then(()=>window.location.href="seller-login.html"); return;
            }

            if(document.getElementById('headerShopName')) document.getElementById('headerShopName').innerText = currentPharmaData.shopName;
            
            const locEl = document.getElementById('pharmaLocationDisplay');
            if(locEl) {
                const displayLoc = currentPharmaData.wilaya || "موقع غير محدد";
                const displayLink = currentPharmaData.gpsLink || "#";
                let finalHref = displayLink;
                if(displayLink.includes(",") && !displayLink.includes("http")) {
                    finalHref = `https://www.google.com/maps?q=${displayLink.trim()}`;
                }

                locEl.innerHTML = `<a href="${finalHref}" target="_blank" class="hover:underline hover:text-blue-600 flex items-center gap-1">
                    <span>📍</span> ${displayLoc} <span class="text-[9px] text-blue-500 font-bold">(عرض الخريطة)</span>
                </a>`;
            }

            if(document.getElementById('pharmaStarsDisplay')) {
                const rating = currentPharmaData.rating || 0;
                const count = currentPharmaData.reviewCount || 0;
                document.getElementById('pharmaStarsDisplay').innerHTML = window.getStarRatingHTML(rating) + `<span class="text-[9px] text-gray-400 mr-1">(${count} تقييم)</span>`;
            }
        }
        hideLoader();
    });

    let respondedIds = new Set();
    onSnapshot(query(collection(db, "responses"), where("pharmaId", "==", pharmaId)), (snap) => {
        respondedIds.clear(); snap.forEach(d => respondedIds.add(d.data().requestId));
        if(document.getElementById('totalSalesCount')) document.getElementById('totalSalesCount').innerText = snap.size;
        const list = document.getElementById('myOffersList');
        if(list) {
            list.innerHTML = snap.empty ? `<p class="text-center text-xs text-gray-400 py-4">سجل الردود فارغ</p>` : "";
            snap.forEach(d => list.innerHTML += `<div class="bg-white p-3 mb-2 rounded border border-gray-100 shadow-sm text-xs">✅ رددت على طلب <span class="font-bold">${d.data().requestId.substr(0,5)}</span> <span class="text-gray-400 float-left">${timeAgo(d.data().createdAt)}</span></div>`);
        }
    });

    onSnapshot(query(collection(db, "requests"), orderBy("createdAt", "desc")), (snap) => {
        const list = document.getElementById('ordersList');
        if(!list) return;
        list.innerHTML = "";
        let count = 0; const now = new Date();

        snap.forEach(d => {
            const req = d.data();
            let expired = false;
            if(req.expiresAt) {
                const exp = req.expiresAt.toDate ? req.expiresAt.toDate() : new Date(req.expiresAt);
                if(now > exp) expired = true;
            }

            if(req.status !== 'completed' && !respondedIds.has(d.id) && !expired) {
                count++;
                list.innerHTML += `
                <div class="bg-white p-5 rounded-2xl shadow border border-slate-100 mb-4">
                    <div class="flex justify-between items-start mb-2">
                        <h3 class="font-bold text-lg text-slate-800">${req.medName}</h3>
                        <span class="text-[10px] bg-slate-100 px-2 py-1 rounded text-gray-500">${timeAgo(req.createdAt)}</span>
                    </div>
                    <div class="text-xs text-gray-500 mb-2">📍 ${req.wilaya}</div>
                    <a href="tel:${req.phoneNumber}" class="inline-block bg-blue-50 text-blue-600 text-xs font-bold px-3 py-2 rounded mb-3">📞 هاتف: ${req.phoneNumber}</a>
                    ${req.notes ? `<div class="bg-orange-50 text-orange-800 text-xs p-2 rounded mb-3 border-r-2 border-orange-200">${req.notes}</div>` : ''}
                    
                    <div class="grid grid-cols-1 gap-2">
                        ${req.imageUrl ? `<button onclick="window.openLightbox('${req.imageUrl}')" class="bg-slate-700 text-white py-2 rounded text-xs font-bold">📷 عرض الوصفة</button>` : ''}
                        <button onclick="window.respondToRequest('${d.id}')" class="bg-green-600 text-white py-3 rounded text-sm font-bold shadow-lg shadow-green-100 hover:bg-green-700">✅ الدواء متوفر</button>
                    </div>
                </div>`;
            }
        });
        if(count === 0) list.innerHTML = `<div class="text-center py-20 text-gray-400">لا توجد طلبات جديدة</div>`;
    });
}

window.logout = () => { if(confirm("خروج؟")) signOut(auth).then(() => window.location.href = "seller-login.html"); };

window.updatePharmaLocation = () => {
    const btn = document.getElementById('btnUpdateLoc');
    if(!navigator.geolocation) return alert("الجهاز لا يدعم GPS");
    btn.innerHTML = "جاري التحديد..."; btn.disabled = true;
    navigator.geolocation.getCurrentPosition(async (pos) => {
        const link = `https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`;
        await updateDoc(doc(db, "pharmacists", currentPharmaId), { gpsLink: link });
        alert("تم تحديث موقعك ✅"); 
        btn.innerHTML = "📍 تحديث تلقائي (GPS)"; btn.disabled = false;
    }, (err) => { alert("فشل تحديد الموقع"); btn.innerHTML = "📍 تحديث تلقائي (GPS)"; btn.disabled = false; }, { enableHighAccuracy: true });
};

window.updatePharmaPhone = async () => { const phone = document.getElementById('editPhone').value; if(phone) { await updateDoc(doc(db, "pharmacists", currentPharmaId), { phone: phone }); alert("تم تغيير الرقم ✅"); } };

window.changePharmaPassword = async () => {
    const oldP = document.getElementById('oldPass').value;
    const newP = document.getElementById('newPass').value;
    const cfmP = document.getElementById('confirmPass').value;
    if(!oldP || !newP || newP !== cfmP) return alert("تأكد من البيانات");
    try {
        const cred = EmailAuthProvider.credential(auth.currentUser.email, oldP);
        await reauthenticateWithCredential(auth.currentUser, cred);
        await updatePassword(auth.currentUser, newP);
        alert("تم تغيير كلمة المرور"); document.getElementById('passFieldsContainer').classList.add('hidden');
    } catch(e) { alert("كلمة السر القديمة خطأ"); }
};

window.respondToRequest = async (rid) => {
    const note = prompt("ملاحظة للمريض (السعر/تفاصيل):");
    if(note === null) return;
    try {
        await addDoc(collection(db, "responses"), {
            requestId: rid, pharmaId: auth.currentUser.uid,
            pharmaName: currentPharmaData.shopName, phone: currentPharmaData.phone,
            wilaya: currentPharmaData.wilaya, gpsLink: currentPharmaData.gpsLink,
            notes: note, createdAt: serverTimestamp()
        });
        alert("تم الإرسال!");
    } catch(e) { alert("حدث خطأ"); }
};