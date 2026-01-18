import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, getDoc, setDoc, doc, updateDoc, deleteDoc, query, where, orderBy, onSnapshot, serverTimestamp, writeBatch, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ============================================================
// 1. إعدادات المشروع (Pharma Pro)
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
// 2. ستايل الواجهة + شاشة التحميل (CSS Injection)
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
        color: white; border: none; cursor: pointer; position: relative; z-index: 10;
    }
    .btn-attention:active { transform: scale(0.95); animation: none; }
    #globalLoader { position: fixed; inset: 0; background: #f8fafc; z-index: 99999; display: flex; justify-content: center; align-items: center; transition: opacity 0.3s; }
    /* ستايل الصور في الأدمن والدردشة */
    .lightbox-img { cursor: zoom-in; transition: transform 0.2s; }
    .lightbox-img:hover { transform: scale(1.02); }
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
// 3. إدارة الصلاحيات (Auth State Management)
// ============================================================
const isDashPage = document.getElementById('ordersList'); 
const isLoginPage = document.getElementById('sellerLoginBtn');

// إخفاء اللودر فوراً للصفحات العامة
if (!isDashPage && !isLoginPage) hideLoader();

onAuthStateChanged(auth, async (user) => {
    // 1. نحن في صفحة الدخول
    if (isLoginPage) {
        if (user) {
            // المستخدم مسجل دخول، نفحص حالته في قاعدة البيانات
            const docRef = doc(db, "pharmacists", user.uid);
            getDoc(docRef).then((docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.isVerified === true && !data.isBlocked) {
                        window.location.href = "dash.html"; // مفعل -> توجيه
                    } else {
                        signOut(auth); // غير مفعل -> خروج صامت
                        hideLoader();
                    }
                } else {
                    signOut(auth); // ليس صيدلياً
                    hideLoader();
                }
            });
        } else {
            hideLoader(); // السماح برؤية فورم الدخول
        }
        return;
    }

    // 2. نحن في صفحة الداشبورد
    if (isDashPage) {
        if (user) {
            const docRef = doc(db, "pharmacists", user.uid);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.isVerified === true && !data.isBlocked) {
                    initDashboard(user); // تفعيل الداشبورد
                } else {
                    alert("⚠️ حسابك قيد المراجعة أو تم حظره من قبل الإدارة.");
                    await signOut(auth);
                    window.location.href = "seller-login.html";
                }
            } else {
                window.location.href = "seller-login.html";
            }
        } else {
            window.location.href = "seller-login.html";
        }
    }
});

// ============================================================
// 4. دوال عامة (Lightbox, TimeAgo, Stars)
// ============================================================

// Lightbox (عارض الصور)
window.openLightbox = (src) => {
    let box = document.getElementById('imgLightbox');
    if (!box) {
        box = document.createElement('div');
        box.id = 'imgLightbox';
        box.className = 'fixed inset-0 z-[100] bg-black/95 hidden flex justify-center items-center backdrop-blur-sm';
        box.innerHTML = `
            <div class="relative max-w-[95%] max-h-[95%]">
                <button onclick="document.getElementById('imgLightbox').classList.add('hidden')" class="absolute -top-10 right-0 text-white bg-red-600 rounded-full p-2">✕</button>
                <img id="lightboxImg" src="" class="max-w-full max-h-[85vh] rounded shadow-2xl">
            </div>`;
        box.onclick = (e) => { if(e.target === box) box.classList.add('hidden'); };
        document.body.appendChild(box);
    }
    document.getElementById('lightboxImg').src = src;
    box.classList.remove('hidden');
};

function timeAgo(t) {
    if(!t) return "";
    const s = Math.floor((new Date() - t.toDate())/1000);
    if(s>86400) return Math.floor(s/86400) + " يوم";
    if(s>3600) return Math.floor(s/3600) + " س";
    if(s>60) return Math.floor(s/60) + " د";
    return "الآن";
}

window.getStarRatingHTML = (rating) => {
    const r = parseFloat(rating) || 0;
    const fullStars = Math.floor(r);
    let html = '';
    for(let i=0; i<5; i++) {
        html += i < fullStars ? '<span class="text-yellow-400">★</span>' : '<span class="text-gray-200">★</span>';
    }
    return `<div class="flex text-sm tracking-tighter">${html} <span class="text-[10px] text-gray-400 mr-1 pt-1">(${r.toFixed(1)})</span></div>`;
};

// ============================================================
// 5. منطق الزبون/المريض (طلب دواء + تتبع)
// ============================================================
const compressImage = (file) => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const scale = 800 / img.width;
                canvas.width = (img.width > 800) ? 800 : img.width;
                canvas.height = (img.width > 800) ? img.height * scale : img.height;
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.6));
            };
        };
    });
};

// --- إرسال الطلب ---
if (document.getElementById('medImage')) {
    let uploadedBase64 = null;
    document.getElementById('medImage').addEventListener('change', async (e) => {
        if (e.target.files[0]) {
            const preview = document.getElementById('imagePreview');
            preview.src = URL.createObjectURL(e.target.files[0]);
            preview.classList.remove('hidden');
            document.getElementById('uploadPlaceholder').classList.add('hidden');
            uploadedBase64 = await compressImage(e.target.files[0]);
        }
    });

    document.getElementById('submitBtn').addEventListener('click', async () => {
        const medName = document.getElementById('medName').value;
        const phone = document.getElementById('phoneNumber').value;
        const wilaya = document.getElementById('wilaya').value;
        const notes = document.getElementById('notes').value;

        if(!phone) return alert("رقم الهاتف ضروري للتواصل");
        if(!medName && !uploadedBase64) return alert("يرجى كتابة اسم الدواء أو إرفاق الوصفة");

        const btn = document.getElementById('submitBtn');
        btn.innerText = "جاري الإرسال..."; btn.disabled = true;

        try {
            const code = Math.floor(1000 + Math.random() * 9000).toString();
            await addDoc(collection(db, "requests"), {
                medName: medName || "وصفة طبية",
                wilaya: wilaya,
                notes: notes,
                phoneNumber: phone,
                imageUrl: uploadedBase64,
                secretCode: code,
                status: "active",
                createdAt: serverTimestamp()
            });

            document.getElementById('formScreen').classList.add('hidden');
            document.getElementById('successScreen').classList.remove('hidden');
            document.getElementById('successScreen').classList.add('flex');
            document.getElementById('secretCodeDisplay').innerText = code;
        } catch (e) {
            console.error(e);
            alert("حدث خطأ أثناء الإرسال");
            btn.disabled = false; btn.innerText = "إرسال الطلب";
        }
    });
}

// --- تتبع الطلب (Track) ---
const trackBtn = document.getElementById('trackBtn');
if (trackBtn) {
    trackBtn.addEventListener('click', async () => {
        const phone = document.getElementById('trackPhone').value.trim();
        const code = document.getElementById('trackCode').value.trim();
        
        if(!phone || !code) return alert("يرجى إدخال الهاتف وكود التتبع");
        
        trackBtn.innerText = "جاري البحث...";
        
        const q = query(collection(db, "requests"), where("phoneNumber", "==", phone), where("secretCode", "==", code));
        onSnapshot(q, (snap) => {
            if(snap.empty) { alert("لم يتم العثور على طلب بهذا الكود"); trackBtn.innerText = "عرض النتائج"; return; }
            
            const reqDoc = snap.docs[0];
            const reqData = reqDoc.data();
            
            document.getElementById('loginSection').classList.add('hidden');
            document.getElementById('dashboardSection').classList.remove('hidden');
            document.getElementById('orderTitle').innerText = reqData.medName;

            // جلب الردود
            onSnapshot(query(collection(db, "responses"), where("requestId", "==", reqDoc.id)), (respSnap) => {
                const list = document.getElementById('offersList');
                list.innerHTML = "";
                if(respSnap.empty) { 
                    list.innerHTML = `<div class="text-center p-8 border border-dashed rounded-xl text-gray-400">لا توجد ردود حتى الآن<br>يرجى الانتظار قليلاً</div>`; 
                    return; 
                }

                respSnap.forEach(d => {
                    const r = d.data();
                    list.innerHTML += `
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm mb-4">
                        <div class="flex justify-between items-start">
                            <h3 class="font-bold text-slate-800 text-lg">${r.pharmaName}</h3>
                            <span class="bg-green-100 text-green-700 text-[10px] px-2 py-1 rounded font-bold">متوفر</span>
                        </div>
                        <p class="text-xs text-gray-500 mb-2">📍 ${r.wilaya}</p>
                        ${r.notes ? `<div class="bg-slate-50 p-3 rounded mb-3 text-xs text-slate-600 border">💬 ${r.notes}</div>` : ''}
                        
                        <div class="grid grid-cols-2 gap-3 mb-3">
                            <a href="tel:${r.phone}" onclick="window.markRequestAsTaken('${r.requestId}')" class="bg-slate-100 text-slate-700 py-3 rounded-xl text-xs font-bold text-center">📞 اتصال</a>
                            ${r.gpsLink ? `<a href="${r.gpsLink}" target="_blank" onclick="window.markRequestAsTaken('${r.requestId}')" class="bg-blue-50 text-blue-600 py-3 rounded-xl text-xs font-bold text-center">🗺️ الخريطة</a>` : ''}
                        </div>
                        <button onclick="window.openReviewModal('${r.pharmaId}', '${r.pharmaName}', '${r.wilaya}')" class="btn-attention w-full py-3 rounded-xl font-bold text-sm">⭐ تقييم الصيدلية</button>
                    </div>`;
                });
            });
        });
    });
}

// دالة وضع علامة "تم التفاعل" (لإخفاء الطلب لاحقاً)
window.markRequestAsTaken = async (requestId) => {
    try {
        const ref = doc(db, "requests", requestId);
        const snap = await getDoc(ref);
        if(snap.exists() && !snap.data().expiresAt) {
            const exp = new Date(); exp.setHours(exp.getHours() + 48);
            await updateDoc(ref, { expiresAt: exp, interactionStarted: true });
        }
    } catch(e) {}
};

// --- التقييم (Reviews) ---
let currentReviewPharmaId = null; 
let currentRating = 0;

window.openReviewModal = (pharmaId, name, wilaya) => {
    currentReviewPharmaId = pharmaId;
    const modal = document.getElementById('reviewModal');
    if(!modal) return;
    document.getElementById('reviewSellerName').innerText = name;
    document.getElementById('reviewSellerWilaya').innerText = wilaya;
    currentRating = 0;
    window.setStars(0);
    modal.classList.remove('hidden'); modal.classList.add('flex');
    setTimeout(() => modal.classList.add('active'), 10);
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
    const btn = document.querySelector('#reviewModal button.btn-attention');
    if(btn) { btn.innerText = "جاري الإرسال..."; btn.disabled = true; }

    try {
        const pharmaRef = doc(db, "pharmacists", currentReviewPharmaId);
        await runTransaction(db, async (t) => {
            const docSnap = await t.get(pharmaRef);
            if (!docSnap.exists()) throw "Error";
            const d = docSnap.data();
            const newCount = (d.reviewCount || 0) + 1;
            const newRating = ((d.rating || 0) * (d.reviewCount || 0) + currentRating) / newCount;
            t.update(pharmaRef, { rating: newRating, reviewCount: newCount });
            t.set(doc(collection(db, "reviews")), { 
                pharmaId: currentReviewPharmaId, 
                pharmaName: d.shopName, 
                stars: currentRating, 
                text: text, 
                createdAt: serverTimestamp() 
            });
        });
        alert("✅ شكراً لتقييمك!");
        window.closeReviewModal();
    } catch(e) { alert("حدث خطأ"); }
    if(btn) { btn.innerText = "إرسال التقييم"; btn.disabled = false; }
};

// ============================================================
// 6. منطق الصيدلي (Login & Register & Dashboard)
// ============================================================

if (isLoginPage) {
    // --- (أ) تسجيل الدخول ---
    const loginBtn = document.getElementById('sellerLoginBtn');
    loginBtn.addEventListener('click', async () => {
        const email = document.getElementById('loginEmail').value;
        const pass = document.getElementById('loginPassword').value;
        
        if(!email || !pass) return alert("أدخل البيانات");

        loginBtn.innerText = "جاري التحقق..."; loginBtn.disabled = true;

        try {
            const userCred = await signInWithEmailAndPassword(auth, email, pass);
            // التحقق اليدوي قبل التحويل
            const snap = await getDoc(doc(db, "pharmacists", userCred.user.uid));
            if(snap.exists()) {
                const d = snap.data();
                if(d.isBlocked) {
                    alert("⛔ حسابك محظور"); await signOut(auth);
                } else if(!d.isVerified) {
                    alert("⏳ حسابك قيد المراجعة، يرجى الانتظار."); await signOut(auth);
                }
                // إذا مفعل -> onAuthStateChanged سيتولى التحويل
            } else {
                alert("الحساب غير موجود"); await signOut(auth);
            }
        } catch(e) {
            console.error(e);
            alert("خطأ في البريد أو كلمة السر");
        }
        loginBtn.innerText = "دخول للوحة التحكم"; loginBtn.disabled = false;
    });

    // --- (ب) إنشاء حساب (الطريقة الآمنة من الكود الناجح) ---
    const regBtn = document.getElementById('authBtn');
    if (regBtn) {
        regBtn.addEventListener('click', async () => {
            const email = document.getElementById('email').value;
            const pass = document.getElementById('password').value;
            const shopName = document.getElementById('shopName').value;
            const phone = document.getElementById('phone').value;
            const gpsLink = document.getElementById('gpsLink').value; 

            if(!shopName || !phone || !gpsLink || !email || !pass) return alert("يرجى تحديد الموقع وملء البيانات");
            if(pass.length < 6) return alert("كلمة السر قصيرة");

            regBtn.innerText = "جاري الإنشاء..."; regBtn.disabled = true;

            try {
                // 1. إنشاء الحساب
                const cred = await createUserWithEmailAndPassword(auth, email, pass);
                
                // 2. حفظ البيانات (مباشرة، بدون جلب خرائط لتفادي التعليق)
                await setDoc(doc(db, "pharmacists", cred.user.uid), {
                    shopName, phone, email, 
                    gpsLink: gpsLink, 
                    wilaya: "موقع GPS", // لتجنب التعليق
                    isVerified: false,  // غير مفعل
                    isBlocked: false, 
                    rating: 0, reviewCount: 0, 
                    createdAt: serverTimestamp()
                });

                // 3. خروج فوري
                await signOut(auth);

                // 4. رسالة النجاح
                alert(`✅ تم إرسال طلبك بنجاح!
                
مرحباً دكتور: ${shopName}
حسابك الآن قيد المراجعة من قبل الإدارة للتحقق من الهوية.
سيتم تفعيل الحساب قريباً.`);
                
                window.location.reload();

            } catch(e) { 
                alert("حدث خطأ: " + (e.code==='auth/email-already-in-use'?"البريد مسجل مسبقاً":e.message)); 
                regBtn.innerText = "إنشاء حساب جديد"; regBtn.disabled = false;
            }
        });
    }

    // استعادة كلمة السر
    document.getElementById('btnSendReset').addEventListener('click', async () => {
        const mail = document.getElementById('forgotEmail').value;
        if(mail) {
            try { await sendPasswordResetEmail(auth, mail); alert("تم الإرسال"); document.getElementById('forgotModal').classList.add('hidden'); }
            catch(e) { alert("خطأ"); }
        }
    });
}

// --- (ج) داشبورد الصيدلي ---
let currentPharmaData = null;
async function initDashboard(user) {
    const pharmaId = user.uid;

    onSnapshot(doc(db, "pharmacists", pharmaId), (snap) => {
        if(snap.exists()) {
            currentPharmaData = snap.data();
            if(currentPharmaData.isBlocked) { location.reload(); return; } // طرد فوري

            if(document.getElementById('headerShopName')) document.getElementById('headerShopName').innerText = currentPharmaData.shopName;
            
            const locEl = document.getElementById('pharmaLocationDisplay');
            if(locEl) {
                const link = currentPharmaData.gpsLink || "#";
                locEl.innerHTML = `<a href="${link}" target="_blank" class="text-blue-600 underline font-bold">📍 موقعك (GPS)</a>`;
            }

            if(document.getElementById('pharmaStarsDisplay')) {
                const r = currentPharmaData.rating || 0;
                const c = currentPharmaData.reviewCount || 0;
                document.getElementById('pharmaStarsDisplay').innerHTML = `⭐ ${r.toFixed(1)} <span class="text-xs text-gray-400">(${c})</span>`;
            }
        }
        hideLoader();
    });

    // الطلبات
    const list = document.getElementById('ordersList');
    let respondedIds = new Set();

    // 1. ما تم الرد عليه
    onSnapshot(query(collection(db, "responses"), where("pharmaId", "==", pharmaId)), (snap) => {
        respondedIds.clear();
        snap.forEach(d => respondedIds.add(d.data().requestId));
        if(document.getElementById('totalSalesCount')) document.getElementById('totalSalesCount').innerText = snap.size;
        
        const myOffers = document.getElementById('myOffersList');
        if(myOffers) {
            myOffers.innerHTML = snap.empty ? `<p class="text-center text-gray-400 py-4 text-xs">سجلك فارغ</p>` : "";
            snap.forEach(d => {
                myOffers.innerHTML += `<div class="bg-white p-3 mb-2 rounded border border-green-100 shadow-sm text-xs">✅ رددت على طلب <span class="font-bold">(${d.data().requestId.substr(0,5)})</span></div>`;
            });
        }
    });

    // 2. الطلبات الجديدة
    onSnapshot(query(collection(db, "requests"), orderBy("createdAt", "desc")), (snap) => {
        if(!list) return;
        list.innerHTML = "";
        let count = 0;
        const now = new Date();

        snap.forEach(d => {
            const req = d.data();
            let isExpired = false;
            if(req.expiresAt) {
                const exp = req.expiresAt.toDate ? req.expiresAt.toDate() : new Date(req.expiresAt);
                if(now > exp) isExpired = true;
            }

            if(req.status !== 'completed' && !respondedIds.has(d.id) && !isExpired) {
                count++;
                list.innerHTML += `
                <div class="bg-white p-5 rounded-2xl shadow border border-slate-100 mb-4 hover:shadow-lg transition">
                    <div class="flex justify-between items-start mb-2">
                        <h3 class="font-bold text-lg text-slate-800">${req.medName}</h3>
                        <span class="text-[10px] bg-slate-100 px-2 py-1 rounded text-gray-500">${timeAgo(req.createdAt)}</span>
                    </div>
                    <div class="text-xs text-gray-500 mb-2 font-bold">📍 ولاية: ${req.wilaya}</div>
                    <a href="tel:${req.phoneNumber}" class="inline-block bg-blue-50 text-blue-600 text-xs font-bold px-3 py-2 rounded mb-3 border border-blue-100">📞 ${req.phoneNumber}</a>
                    ${req.notes ? `<div class="bg-orange-50 text-orange-800 text-xs p-2 rounded mb-3 border-r-2 border-orange-200">${req.notes}</div>` : ''}
                    <div class="grid grid-cols-1 gap-2 mt-2">
                        ${req.imageUrl ? `<button onclick="window.openLightbox('${req.imageUrl}')" class="bg-slate-700 text-white py-2.5 rounded-xl text-xs font-bold shadow-md">📷 صورة الوصفة</button>` : ''}
                        <button onclick="window.respondToRequest('${d.id}')" class="bg-green-600 text-white py-3 rounded-xl text-sm font-bold shadow-lg shadow-green-100 hover:bg-green-700 transition">✅ الدواء متوفر</button>
                    </div>
                </div>`;
            }
        });
        if(count === 0) list.innerHTML = `<div class="text-center py-20 text-gray-400">لا توجد طلبات جديدة</div>`;
    });
}

// ============================================================
// 7. منطق الأدمن (ADMIN PANEL) - مضاف ومطابق للكود الناجح
// ============================================================
// يتم تفعيل هذا الجزء فقط إذا تم تسجيل الدخول كأدمن

// تحقق مبدئي
document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById('adminLoginScreen')) {
        checkAdminAuth();
    }
    
    // زر دخول الأدمن
    const btnAdmin = document.getElementById('btnAdminLogin');
    if(btnAdmin) {
        btnAdmin.addEventListener('click', async () => {
            const email = document.getElementById('adminEmail').value.trim();
            const pass = document.getElementById('adminPass').value;
            const ADMIN_EMAIL = "david_hassan5@hotmail.com"; // البريد الثابت

            if(!email || !pass) return alert("البيانات ناقصة");

            btnAdmin.innerText = "تحقق..."; btnAdmin.disabled = true;

            try {
                const u = await signInWithEmailAndPassword(auth, email, pass);
                if(u.user.email !== ADMIN_EMAIL) {
                    await signOut(auth); alert("ليس لديك صلاحية");
                } else {
                    localStorage.setItem('adminLoggedIn', 'true');
                    checkAdminAuth();
                }
            } catch(e) { alert("خطأ في الدخول"); }
            btnAdmin.innerText = "دخول"; btnAdmin.disabled = false;
        });
    }
});

function checkAdminAuth() {
    const isAdmin = localStorage.getItem('adminLoggedIn') === 'true';
    const loginDiv = document.getElementById('adminLoginScreen');
    const dashDiv = document.getElementById('adminDashboard');
    if(!loginDiv || !dashDiv) return;

    if(isAdmin) {
        loginDiv.style.display = 'none';
        dashDiv.style.display = 'flex';
        initAdminPanel();
    } else {
        dashDiv.style.display = 'none';
        loginDiv.style.display = 'flex';
    }
}

window.adminLogout = async () => {
    if(confirm("خروج؟")) { await signOut(auth); localStorage.removeItem('adminLoggedIn'); location.reload(); }
};

function initAdminPanel() {
    // 1. الصيادلة المعلقين (Pending)
    onSnapshot(query(collection(db, "pharmacists"), where("isVerified", "==", false)), (snap) => {
        const list = document.getElementById('adminPendingList');
        if(document.getElementById('statPending')) document.getElementById('statPending').innerText = snap.size;
        if(!list) return;
        list.innerHTML = snap.empty ? "<p class='text-center text-gray-500 py-4 text-xs'>لا يوجد طلبات معلقة</p>" : "";
        
        snap.forEach(d => {
            const p = d.data();
            list.innerHTML += `
            <div class="bg-gray-800 p-4 rounded-xl border border-gray-700 mb-2 flex justify-between items-center">
                <div>
                    <h4 class="font-bold text-white">${p.shopName}</h4>
                    <p class="text-xs text-blue-400 font-mono">${p.phone} | ${p.email}</p>
                    <a href="${p.gpsLink}" target="_blank" class="text-[10px] text-gray-400 underline">الموقع</a>
                </div>
                <div class="flex gap-2">
                    <button onclick="adminApprovePharma('${d.id}')" class="bg-green-600 text-white px-3 py-1 rounded text-xs font-bold">قبول</button>
                    <button onclick="adminDeleteDoc('pharmacists','${d.id}')" class="bg-red-500/20 text-red-400 px-3 py-1 rounded text-xs">رفض</button>
                </div>
            </div>`;
        });
    });

    // 2. الصيادلة النشطين
    onSnapshot(collection(db, "pharmacists"), (snap) => {
        const active = snap.docs.filter(d => d.data().isVerified === true);
        if(document.getElementById('statSellers')) document.getElementById('statSellers').innerText = active.length;
        
        const list = document.getElementById('adminSellersList');
        if(list) {
            list.innerHTML = "";
            active.forEach(d => {
                const p = d.data();
                list.innerHTML += `
                <div class="bg-gray-800 p-3 rounded-xl border border-gray-700 mb-2">
                    <div class="flex justify-between">
                        <h4 class="font-bold text-white text-sm">${p.shopName}</h4>
                        <span class="text-[10px] ${p.isBlocked ? 'text-red-400':'text-green-400'}">${p.isBlocked?'محظور':'نشط'}</span>
                    </div>
                    <div class="flex gap-2 mt-2">
                        <button onclick="adminToggleBlock('${d.id}', ${p.isBlocked})" class="bg-gray-700 text-white px-2 py-1 rounded text-[10px] flex-1">${p.isBlocked ? 'فك الحظر' : 'حظر'}</button>
                        <button onclick="adminDeleteDoc('pharmacists','${d.id}')" class="bg-red-500/20 text-red-400 px-2 py-1 rounded text-[10px]">حذف</button>
                    </div>
                </div>`;
            });
        }
    });

    // 3. الطلبات (Requests)
    onSnapshot(query(collection(db, "requests"), orderBy("createdAt", "desc")), (snap) => {
        if(document.getElementById('statOrders')) document.getElementById('statOrders').innerText = snap.size;
        const list = document.getElementById('adminOrdersList');
        if(list) {
            list.innerHTML = "";
            snap.docs.slice(0, 50).forEach(d => {
                const r = d.data();
                list.innerHTML += `
                <div class="bg-gray-800 p-3 rounded-xl border border-gray-700 mb-2 flex justify-between items-center">
                    <div class="flex items-center gap-2">
                        ${r.imageUrl ? `<img src="${r.imageUrl}" class="w-8 h-8 rounded object-cover cursor-zoom-in" onclick="openLightbox(this.src)">` : ''}
                        <div>
                            <p class="text-white text-sm font-bold">${r.medName}</p>
                            <p class="text-[10px] text-gray-500">${r.phoneNumber}</p>
                        </div>
                    </div>
                    <button onclick="adminDeleteDoc('requests','${d.id}')" class="text-red-400 hover:bg-red-500/10 p-1 rounded">✕</button>
                </div>`;
            });
        }
    });
}

// دوال الأدمن (Global)
window.adminApprovePharma = async (id) => {
    if(confirm("تفعيل هذا الصيدلي؟")) await updateDoc(doc(db, "pharmacists", id), { isVerified: true });
};
window.adminDeleteDoc = async (col, id) => {
    if(confirm("حذف نهائي؟")) await deleteDoc(doc(db, col, id));
};
window.adminToggleBlock = async (id, status) => {
    await updateDoc(doc(db, "pharmacists", id), { isBlocked: !status });
};

// دوال أخرى للصيدلي
window.updatePharmaPhone = async () => { 
    const p = document.getElementById('editPhone').value; 
    if(p) { await updateDoc(doc(db, "pharmacists", auth.currentUser.uid), { phone: p }); alert("تم"); } 
};
window.respondToRequest = async (rid) => {
    const note = prompt("ملاحظة للمريض:");
    if(!note) return;
    await addDoc(collection(db, "responses"), {
        requestId: rid, pharmaId: auth.currentUser.uid, 
        pharmaName: currentPharmaData.shopName, phone: currentPharmaData.phone,
        wilaya: currentPharmaData.wilaya, gpsLink: currentPharmaData.gpsLink,
        notes: note, createdAt: serverTimestamp()
    });
    alert("تم الرد");
};
