import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider, onAuthStateChanged, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
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

// [تصحيح] تثبيت الجلسة لمنع خروج الأدمن أو الصيدلي عند تحديث الصفحة
setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.error("Persistence Error:", error);
});

// ============================================================
// 2. ستايل الزر + شاشة التحميل (CSS)
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
        color: white;
        cursor: pointer !important;
        position: relative;
        z-index: 10;
        border: none;
    }
    .btn-attention:active {
        transform: scale(0.95);
        animation: none;
    }
    #globalLoader { 
        position: fixed; inset: 0; background: #f8fafc; z-index: 99999; 
        display: flex; justify-content: center; align-items: center; transition: opacity 0.3s; 
    }
`;
document.head.appendChild(styleSheet);

const loaderDiv = document.createElement('div');
loaderDiv.id = 'globalLoader';
loaderDiv.innerHTML = '<div class="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-green-600"></div>';
document.body.appendChild(loaderDiv);

function hideLoader() {
    const loader = document.getElementById('globalLoader');
    if(loader) {
        loader.style.opacity = '0';
        setTimeout(() => { if(loader.parentNode) loader.parentNode.removeChild(loader); }, 300);
    }
}

// ============================================================
// 3. المنطق الذكي للتحقق من الصفحات (Access Control)
// ============================================================

// تحديد الصفحة الحالية
const isDashPage = document.getElementById('ordersList'); // dash.html
const isLoginPage = document.getElementById('sellerLoginBtn'); // seller-login.html
const isAdminPage = document.getElementById('adminPendingList'); // admin.html (يجب إضافة هذا ID في صفحة الادمن)

// إذا لم تكن في صفحات تتطلب تحميل بيانات، اخفِ اللودر فوراً
if (!isDashPage && !isLoginPage && !isAdminPage) {
    hideLoader();
}

// مراقبة المصادقة
onAuthStateChanged(auth, async (user) => {
    // 1. التعامل مع صفحة الدخول
    if (isLoginPage) {
        if (user) {
            // المستخدم مسجل، نفحص هل هو أدمن أم صيدلي وهل هو مفعل
            await checkUserStatus(user);
        } else {
            hideLoader();
        }
        return;
    }

    // 2. التعامل مع صفحة الداشبورد
    if (isDashPage) {
        if (user) {
            // التأكد من أن الحساب مفعل (isVerified)
            const docSnap = await getDoc(doc(db, "pharmacists", user.uid));
            if (docSnap.exists()) {
                if (docSnap.data().isVerified === true) {
                    initDashboard(user); // الحساب مفعل -> حمل الداشبورد
                } else {
                    // الحساب غير مفعل
                    alert("⛔ حسابك قيد المراجعة من قبل الإدارة.\nيرجى الانتظار حتى يتم التأكد من بيانات الصيدلية.");
                    await signOut(auth);
                    window.location.href = "seller-login.html";
                }
            } else {
                // مسجل دخول لكن لا يملك وثيقة (ربما أدمن دخل بالخطأ للداشبورد أو حساب محذوف)
                 await signOut(auth);
                 window.location.href = "seller-login.html";
            }
        } else {
            window.location.href = "seller-login.html";
        }
    }

    // 3. التعامل مع صفحة الأدمن (admin.html)
    if (isAdminPage) {
        if (user) {
            // يمكن هنا إضافة شرط خاص بإيميل الأدمن إذا أردت
            initAdminPanel();
        } else {
            window.location.href = "seller-login.html";
        }
    }
});

// دالة مساعدة لفحص الحالة عند محاولة الدخول
async function checkUserStatus(user) {
    // إذا كان الإيميل هو إيميل الأدمن، نرسله لصفحة الأدمن
    // [ملاحظة] استبدل admin@gmail.com بإيميل الأدمن الخاص بك
    if (user.email === "admin@gmail.com") {
        window.location.href = "admin.html";
        return;
    }

    const docRef = doc(db, "pharmacists", user.uid);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        if (docSnap.data().isVerified === true) {
            window.location.href = "dash.html";
        } else {
            alert("⏳ تم استلام طلبك، ولكن الحساب قيد المراجعة.\nسيقوم فريق الدعم بتفعيل حسابك بعد التحقق من البيانات.");
            await signOut(auth); // تسجيل خروج ليبقى في صفحة الدخول
            hideLoader();
        }
    } else {
        // حالة خاصة: إذا كان أدمن
        if(document.location.href.includes("admin.html")) {
             // لا تفعل شيئاً، سيتم التعامل معه في onAuthStateChanged
        } else {
             // مستخدم غريب
             await signOut(auth);
             hideLoader();
        }
    }
}

// ============================================================
// 4. دوال عامة (Helpers)
// ============================================================
window.getStarRatingHTML = (rating) => {
    const r = parseFloat(rating) || 0;
    const fullStars = Math.floor(r);
    const hasHalf = r % 1 >= 0.5;
    let html = '';
    for(let i=0; i<5; i++) {
        if(i < fullStars) html += '<span class="text-yellow-400">★</span>';
        else if(i === fullStars && hasHalf) html += '<span class="text-yellow-400 text-opacity-60">★</span>';
        else html += '<span class="text-gray-200">★</span>';
    }
    return `<div class="flex text-sm tracking-tighter">${html} <span class="text-[10px] text-gray-400 mr-1 pt-1">(${r.toFixed(1)})</span></div>`;
};

window.markRequestAsTaken = async (requestId) => {
    if(!requestId) return;
    try {
        const reqRef = doc(db, "requests", requestId);
        const docSnap = await getDoc(reqRef);
        if (docSnap.exists() && !docSnap.data().expiresAt) {
            const expiryDate = new Date();
            expiryDate.setHours(expiryDate.getHours() + 48); 
            await updateDoc(reqRef, { expiresAt: expiryDate, interactionStarted: true });
        }
    } catch (e) { console.error(e); }
};

let currentReviewPharmaId = null; 
let currentRating = 0;

window.openReviewModal = (pharmaId, name, wilaya) => {
    currentReviewPharmaId = pharmaId;
    const modal = document.getElementById('reviewModal');
    if(!modal) return;
    document.getElementById('reviewSellerName').innerText = name || "صيدلية";
    document.getElementById('reviewSellerWilaya').innerText = wilaya || "";
    currentRating = 0;
    window.setStars(0);
    const textArea = document.getElementById('reviewText');
    if(textArea) textArea.value = "";
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => { modal.classList.add('active'); }, 10);
};

window.closeReviewModal = () => {
    const modal = document.getElementById('reviewModal');
    modal.classList.remove('active');
    setTimeout(() => { modal.classList.remove('flex'); modal.classList.add('hidden'); }, 300);
};

window.setStars = (n) => {
    currentRating = n;
    const spans = document.querySelectorAll('#starContainer span');
    spans.forEach((s, i) => {
        if (i < n) { s.style.color = '#f97316'; s.style.transform = 'scale(1.2)'; } 
        else { s.style.color = '#e2e8f0'; s.style.transform = 'scale(1)'; }
    });
};

window.submitReview = async () => {
    if(currentRating === 0) return alert("الرجاء اختيار عدد النجوم");
    const text = document.getElementById('reviewText').value;
    const btn = document.querySelector('#reviewModal button.btn-attention');
    if(btn) { btn.innerText = "جاري الإرسال..."; btn.disabled = true; }

    try {
        const pharmaRef = doc(db, "pharmacists", currentReviewPharmaId);
        await runTransaction(db, async (transaction) => {
            const pharmaDoc = await transaction.get(pharmaRef);
            if (!pharmaDoc.exists()) throw "Pharmacist not found";
            const data = pharmaDoc.data();
            const newCount = (data.reviewCount || 0) + 1;
            const newRating = ((data.rating || 0) * (data.reviewCount || 0) + currentRating) / newCount;

            transaction.update(pharmaRef, { rating: newRating, reviewCount: newCount });
            const newReviewRef = doc(collection(db, "reviews"));
            transaction.set(newReviewRef, {
                pharmaId: currentReviewPharmaId,
                pharmaName: data.shopName,
                stars: currentRating,
                text: text,
                createdAt: serverTimestamp()
            });
        });
        alert("شكراً لك! تم إرسال تقييمك بنجاح ⭐");
        window.closeReviewModal();
    } catch (e) { console.error(e); alert("حدث خطأ"); } 
    finally { if(btn) { btn.innerText = "إرسال التقييم"; btn.disabled = false; } }
};

async function getLocationFromLink(gpsLink, elementId) {
    if (!gpsLink || !gpsLink.includes("q=")) return;
    try {
        const coords = gpsLink.split("q=")[1].split(",");
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords[0]}&lon=${coords[1]}&zoom=18&addressdetails=1`);
        const data = await response.json();
        const city = data.address.city || data.address.town || "";
        const suburb = data.address.suburb || data.address.neighbourhood || "";
        const elem = document.getElementById(elementId);
        if(elem) {
            elem.innerText = suburb ? `${city} - ${suburb}` : city;
            elem.classList.add("text-slate-800", "font-bold");
            elem.classList.remove("text-gray-500");
        }
    } catch (error) { console.error("Loc Error", error); }
}

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
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800;
                const scale = MAX_WIDTH / img.width;
                if (img.width > MAX_WIDTH) { canvas.width = MAX_WIDTH; canvas.height = img.height * scale; } 
                else { canvas.width = img.width; canvas.height = img.height; }
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.6));
            };
        };
    });
};

// ============================================================
// 5. منطق صفحة المريض (ORDER.HTML)
// ============================================================
if (document.getElementById('medImage')) {
    let uploadedImageBase64 = null;
    const fileInput = document.getElementById('medImage');
    const imagePreview = document.getElementById('imagePreview');
    const uploadPlaceholder = document.getElementById('uploadPlaceholder');

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                imagePreview.src = evt.target.result;
                imagePreview.classList.remove('hidden');
                uploadPlaceholder.classList.add('hidden');
            };
            reader.readAsDataURL(file);
            uploadedImageBase64 = await compressImage(file);
        }
    });

    document.getElementById('submitBtn').addEventListener('click', async (e) => {
        e.preventDefault(); // [تصحيح] منع تحديث الصفحة
        const btn = document.getElementById('submitBtn');
        const medName = document.getElementById('medName').value.trim();
        const wilaya = document.getElementById('wilaya').value;
        const notes = document.getElementById('notes').value;
        const phone = document.getElementById('phoneNumber').value.trim();

        if(!phone) return alert("رقم الهاتف ضروري");
        if(!medName && !uploadedImageBase64) return alert("يجب كتابة اسم الدواء أو وضع صورة");

        btn.innerText = "جاري الإرسال...";
        btn.disabled = true;

        try {
            const code = Math.floor(1000 + Math.random() * 9000).toString();
            await addDoc(collection(db, "requests"), {
                medName: medName || "وصفة طبية (صورة)",
                wilaya: wilaya || "غير محدد",
                notes: notes,
                phoneNumber: phone,
                imageUrl: uploadedImageBase64,
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
            alert("حدث خطأ، حاول مرة أخرى");
            btn.innerText = "إرسال الطلب";
            btn.disabled = false;
        }
    });
}

// ============================================================
// 6. منطق تتبع الطلب (TRACK.HTML)
// ============================================================
const trackBtn = document.getElementById('trackBtn');
if (trackBtn) {
    trackBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const phone = document.getElementById('trackPhone').value.trim();
        const code = document.getElementById('trackCode').value.trim();
        
        if(!phone || !code) return alert("أدخل البيانات");
        trackBtn.innerText = "جاري البحث...";
        
        const q = query(collection(db, "requests"), where("phoneNumber", "==", phone), where("secretCode", "==", code));
        
        onSnapshot(q, (snap) => {
            if(snap.empty) { 
                alert("لم يتم العثور على الطلب"); 
                trackBtn.innerText = "عرض النتائج"; 
                return; 
            }
            const reqDoc = snap.docs[0];
            const reqData = reqDoc.data();
            
            document.getElementById('loginSection').classList.add('hidden');
            document.getElementById('dashboardSection').classList.remove('hidden');
            document.getElementById('orderTitle').innerText = reqData.medName;

            onSnapshot(query(collection(db, "responses"), where("requestId", "==", reqDoc.id)), async (respSnap) => {
                const list = document.getElementById('offersList');
                list.innerHTML = "";

                if(respSnap.empty) {
                    list.innerHTML = `<div class="bg-slate-50 rounded-2xl p-8 text-center border border-dashed border-slate-300"><p class="text-gray-400">لا توجد ردود حتى الآن</p></div>`;
                    return;
                }

                for (const d of respSnap.docs) {
                    const r = d.data();
                    const locId = `loc-${d.id}`;
                    let pharmaRating = 0;
                    try {
                        const pharmaSnap = await getDoc(doc(db, "pharmacists", r.pharmaId));
                        if(pharmaSnap.exists()) pharmaRating = pharmaSnap.data().rating || 0;
                    } catch(e) {}

                    list.innerHTML += `
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm mb-4 hover:shadow-md transition-all">
                        <div class="flex justify-between items-start mb-3">
                            <div>
                                <h3 class="font-black text-slate-800 text-lg">${r.pharmaName}</h3>
                                ${window.getStarRatingHTML(pharmaRating)}
                                <p id="${locId}" class="text-xs text-gray-500 font-medium mt-1">📍 جارِ تحديد المنطقة...</p>
                            </div>
                            <span class="bg-green-100 text-green-700 text-[10px] px-2 py-1 rounded-lg font-bold">متوفر</span>
                        </div>
                        ${r.notes ? `<div class="bg-slate-50 p-3 rounded-xl border border-slate-100 mb-4 text-xs text-slate-600">💬 ${r.notes}</div>` : ''}
                        
                        <div class="grid grid-cols-2 gap-3 mb-4">
                            <a href="tel:${r.phone}" onclick="window.markRequestAsTaken('${r.requestId}')" class="bg-slate-100 text-slate-700 hover:bg-slate-200 py-3 rounded-xl text-xs font-bold text-center transition">📞 اتصال</a>
                            ${r.gpsLink ? `<a href="${r.gpsLink}" onclick="window.markRequestAsTaken('${r.requestId}')" target="_blank" class="bg-blue-50 text-blue-600 hover:bg-blue-100 py-3 rounded-xl text-xs font-bold text-center transition">🗺️ الخريطة</a>` : ''}
                        </div>

                        <button onclick="window.openReviewModal('${r.pharmaId}', '${r.pharmaName}', '${r.wilaya}')" 
                            class="btn-attention w-full font-bold py-3.5 rounded-xl shadow-lg flex items-center justify-center gap-2">
                            <span class="text-xl">⭐</span>
                            <span>تقييم الصيدلية</span>
                        </button>
                    </div>`;
                    getLocationFromLink(r.gpsLink, locId);
                }
            });
        });
    });
}

// ============================================================
// 7. منطق تسجيل الدخول والإنشاء للصيدلي (seller-login.html)
// ============================================================
const sellerLoginBtn = document.getElementById('sellerLoginBtn');
if (sellerLoginBtn) {
    // 7.1 تسجيل الدخول
    sellerLoginBtn.addEventListener('click', async (e) => {
        e.preventDefault(); // [تصحيح] منع إعادة التحميل
        const email = document.getElementById('loginEmail').value;
        const pass = document.getElementById('loginPassword').value;
        if(!email || !pass) return alert("أدخل البيانات");
        
        sellerLoginBtn.innerText = "جاري الدخول...";
        sellerLoginBtn.disabled = true;

        try {
            await signInWithEmailAndPassword(auth, email, pass);
            // التوجيه يتم تلقائياً عبر onAuthStateChanged في الأعلى
        } catch(e) {
            console.error(e);
            alert("خطأ في الدخول: تأكد من الإيميل وكلمة السر");
            sellerLoginBtn.innerText = "دخول للوحة التحكم";
            sellerLoginBtn.disabled = false;
        }
    });

    // 7.2 إنشاء حساب جديد (هنا التعديل للمصداقية)
    const authBtn = document.getElementById('authBtn');
    if (authBtn) {
        authBtn.addEventListener('click', async (e) => {
            e.preventDefault(); // [تصحيح] منع إعادة التحميل
            
            const btn = document.getElementById('authBtn');
            const email = document.getElementById('email').value;
            const pass = document.getElementById('password').value;
            const shopName = document.getElementById('shopName').value;
            const phone = document.getElementById('phone').value;
            const gpsLink = document.getElementById('gpsLink').value;
            
            if(!shopName || !phone || !gpsLink) return alert("جميع البيانات مطلوبة");
            
            btn.innerText = "جاري الإنشاء...";
            btn.disabled = true;

            try {
                // 1. إنشاء المستخدم
                const cred = await createUserWithEmailAndPassword(auth, email, pass);
                
                // 2. حفظ البيانات مع جعل isVerified = false
                await setDoc(doc(db, "pharmacists", cred.user.uid), {
                    shopName, phone, email, gpsLink, 
                    wilaya: "موقع GPS", 
                    isVerified: false, // الحساب غير مفعل
                    isBlocked: false, 
                    rating: 0, 
                    reviewCount: 0,
                    createdAt: serverTimestamp()
                });

                // 3. تسجيل الخروج وإظهار رسالة
                await signOut(auth);
                alert("✅ تم إرسال طلب الانضمام بنجاح!\n\nللمصداقية، ستقوم الإدارة بمراجعة بيانات الصيدلية والتواصل معك.\nسيتم تفعيل الحساب بعد الموافقة.");
                window.location.reload();

            } catch(e) { 
                console.error(e);
                alert("خطأ: " + e.message); 
                btn.innerText = "إنشاء حساب جديد";
                btn.disabled = false;
            }
        });
    }

    // 7.3 استعادة كلمة المرور
    const btnSendReset = document.getElementById('btnSendReset');
    if (btnSendReset) {
        btnSendReset.addEventListener('click', async (e) => {
            e.preventDefault();
            const email = document.getElementById('forgotEmail').value;
            if (!email) return alert("الرجاء كتابة البريد الإلكتروني");
            
            const originalText = btnSendReset.innerText;
            btnSendReset.innerText = "جاري الإرسال...";
            btnSendReset.disabled = true;

            try {
                await sendPasswordResetEmail(auth, email);
                alert("تم إرسال رابط التعيين!");
                if(window.closeForgotModal) window.closeForgotModal(); 
            } catch (error) {
                alert("خطأ: " + error.message);
            } finally {
                btnSendReset.innerText = originalText;
                btnSendReset.disabled = false;
            }
        });
    }
}

// ============================================================
// 8. منطق لوحة تحكم الصيدلي (dash.html)
// ============================================================
async function initDashboard(user) {
    currentPharmaId = user.uid;
    
    onSnapshot(doc(db, "pharmacists", user.uid), (docSnap) => {
        if (docSnap.exists()) {
            currentPharmaData = docSnap.data();
            
            if(document.getElementById('headerShopName')) 
                document.getElementById('headerShopName').innerText = currentPharmaData.shopName;
            
            if(document.getElementById('pharmaLocationDisplay') && currentPharmaData.gpsLink) {
                getLocationFromLink(currentPharmaData.gpsLink, 'pharmaLocationDisplay');
            }

            if(document.getElementById('pharmaStarsDisplay')) {
                const rating = currentPharmaData.rating || 0;
                const count = currentPharmaData.reviewCount || 0;
                document.getElementById('pharmaStarsDisplay').innerHTML = window.getStarRatingHTML(rating) + `<span class="text-[9px] text-gray-400 mr-1">(${count} تقييم)</span>`;
            }
        }
        hideLoader();
    });

    performWeeklyCleanup();
    startDashboardListeners();
}

const performWeeklyCleanup = async () => {
    try {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 7); 
        const reqQuery = query(collection(db, "requests"), where("createdAt", "<", cutoff));
        const reqSnap = await getDocs(reqQuery);
        const batch = writeBatch(db);
        reqSnap.forEach(d => batch.delete(d.ref));
        await batch.commit();
    } catch (e) { console.error("Cleanup error:", e); }
};

function startDashboardListeners() {
    let respondedIds = new Set();
    
    onSnapshot(query(collection(db, "responses"), where("pharmaId", "==", currentPharmaId)), (snap) => {
        respondedIds.clear();
        snap.forEach(d => respondedIds.add(d.data().requestId));
        if(document.getElementById('totalSalesCount')) document.getElementById('totalSalesCount').innerText = snap.size;
        updateMyOffersList(snap);
    });

    onSnapshot(query(collection(db, "requests"), orderBy("createdAt", "desc")), (snap) => {
        const list = document.getElementById('ordersList');
        if(!list) return;
        list.innerHTML = "";
        let count = 0;
        const now = new Date();

        snap.forEach(d => {
            const req = d.data();
            let isExpired = false;
            if (req.expiresAt) {
                const expiryDate = req.expiresAt.toDate ? req.expiresAt.toDate() : new Date(req.expiresAt);
                if (now > expiryDate) isExpired = true;
            }

            if (req.status !== 'completed' && !respondedIds.has(d.id) && !isExpired) {
                count++;
                list.innerHTML += `
                <div class="bg-white p-6 rounded-[2rem] shadow-lg border border-slate-100 relative overflow-hidden transition-all hover:shadow-xl">
                    <div class="mb-4 space-y-2">
                        <div class="flex justify-between items-start">
                            <h3 class="font-black text-slate-800 text-xl leading-tight">${req.medName}</h3>
                            <span class="text-[10px] text-gray-400 font-mono bg-slate-50 px-2 py-1 rounded-lg">${timeAgo(req.createdAt)}</span>
                        </div>
                        <p class="text-xs text-green-600 font-bold flex items-center gap-1">📍 <span class="text-slate-600">${req.wilaya}</span></p>
                        <a href="tel:${req.phoneNumber}" class="block w-fit text-xs text-blue-600 font-bold bg-blue-50 px-2 py-1 rounded-lg border border-blue-100 hover:bg-blue-100 transition mt-2">
                            📞 هاتف المريض: <span class="font-mono dir-ltr">${req.phoneNumber}</span>
                        </a>
                        ${req.notes ? `<div class="bg-orange-50 border-r-2 border-orange-200 p-3 rounded-l-xl mt-2"><p class="text-xs text-slate-600 leading-relaxed">📝 ${req.notes}</p></div>` : ''}
                        ${req.interactionStarted ? `<div class="mt-1 text-[9px] text-red-500 font-bold animate-pulse">⏳ سيتم الحذف قريباً</div>` : ''}
                    </div>

                    <div class="flex flex-col gap-3 mt-4">
                        ${req.imageUrl ? `<button onclick="window.openLightbox('${req.imageUrl}')" class="w-full bg-slate-800 text-white py-3.5 rounded-xl text-xs font-bold shadow-md hover:bg-slate-700 transition flex items-center justify-center gap-2"><span>📷</span> عرض الوصفة</button>` : `<div class="w-full bg-slate-50 text-gray-400 py-3 rounded-xl text-[10px] font-bold text-center border border-slate-100">🚫 لا توجد صورة</div>`}
                        <button onclick="window.respondToRequest('${d.id}')" class="w-full bg-green-600 text-white py-4 rounded-xl text-sm font-black shadow-lg shadow-green-200 hover:bg-green-700 hover:shadow-xl transition active:scale-[0.98] flex items-center justify-center gap-2"><span>✅</span> متوفر عندي</button>
                    </div>
                </div>`;
            }
        });
        if(count === 0) list.innerHTML = `<div class="text-center py-20 text-gray-300 text-xs uppercase font-bold tracking-widest">لا توجد طلبات جديدة</div>`;
    });
}

function updateMyOffersList(snap) {
    const list = document.getElementById('myOffersList');
    if(!list) return;
    list.innerHTML = "";
    if(snap.empty) { list.innerHTML = `<div class="text-center py-10 text-gray-300 text-xs border border-dashed border-gray-200 rounded-[2rem] bg-white">سجل ردودك فارغ</div>`; return; }
    snap.forEach(d => {
        const r = d.data();
        list.innerHTML += `<div class="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm mb-2 opacity-75"><p class="text-xs font-bold text-gray-800">رد على طلب (ID: ${r.requestId.substr(0,5)})</p><span class="text-[10px] text-gray-400">${timeAgo(r.createdAt)}</span></div>`;
    });
}

window.logout = () => { if(confirm("تسجيل الخروج؟")) { signOut(auth).then(() => window.location.href = "seller-login.html"); } };

window.updatePharmaLocation = () => {
    const btn = document.getElementById('btnUpdateLoc');
    if(!navigator.geolocation) return alert("المتصفح لا يدعم GPS");
    btn.innerHTML = "جاري التحديد..."; btn.disabled = true;
    navigator.geolocation.getCurrentPosition(async (pos) => {
        const link = `https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`;
        await updateDoc(doc(db, "pharmacists", currentPharmaId), { gpsLink: link });
        alert("تم تحديث موقعك بنجاح ✅"); 
        btn.innerHTML = "📍 تحديث تلقائي (GPS)"; btn.disabled = false;
        getLocationFromLink(link, 'pharmaLocationDisplay');
    }, (err) => { alert("فشل تحديد الموقع"); btn.innerHTML = "📍 تحديث تلقائي (GPS)"; btn.disabled = false; }, { enableHighAccuracy: true });
};

window.updatePharmaPhone = async () => { const phone = document.getElementById('editPhone').value; if(phone) { await updateDoc(doc(db, "pharmacists", currentPharmaId), { phone: phone }); alert("تم تغيير الرقم ✅"); } };

window.changePharmaPassword = async () => {
    const oldPass = document.getElementById('oldPass').value;
    const newPass = document.getElementById('newPass').value;
    const confirmPass = document.getElementById('confirmPass').value;
    if(!oldPass || !newPass) return alert("الرجاء ملء جميع الحقول");
    if(newPass !== confirmPass) return alert("كلمات المرور الجديدة غير متطابقة");
    const user = auth.currentUser;
    try {
        const cred = EmailAuthProvider.credential(user.email, oldPass);
        await reauthenticateWithCredential(user, cred);
        await updatePassword(user, newPass);
        alert("تم تغيير كلمة المرور بنجاح ✅");
    } catch(e) { alert("كلمة المرور الحالية غير صحيحة ❌"); }
};

window.respondToRequest = async (requestId) => {
    const notes = prompt("ملاحظة للمريض (مثال: السعر، الكمية، أو 'تعال الآن'):");
    if(notes === null) return; 
    try {
        await addDoc(collection(db, "responses"), { requestId: requestId, pharmaId: currentPharmaId, pharmaName: currentPharmaData.shopName, phone: currentPharmaData.phone, wilaya: currentPharmaData.wilaya, baladiya: currentPharmaData.baladiya || "غير محدد", gpsLink: currentPharmaData.gpsLink, notes: notes, createdAt: serverTimestamp() });
        alert("تم إرسال ردك للمريض! ✅");
    } catch(e) { console.error(e); alert("حدث خطأ في الإرسال"); }
};

// ============================================================
// 9. لوحة تحكم الأدمن (admin.html) - المنطق الجديد
// ============================================================
// يجب أن يكون لديك <div id="adminPendingList"></div> في admin.html

function initAdminPanel() {
    hideLoader();
    const listContainer = document.getElementById('adminPendingList');
    if (!listContainer) return; // لسنا في صفحة الأدمن

    // جلب الصيدليات التي حالتها isVerified == false
    const q = query(collection(db, "pharmacists"), where("isVerified", "==", false));
    
    onSnapshot(q, (snap) => {
        listContainer.innerHTML = "";
        if(snap.empty) {
            listContainer.innerHTML = `<div class="text-center py-10 text-gray-400">لا توجد طلبات معلقة ✅</div>`;
            return;
        }

        snap.forEach(d => {
            const pharma = d.data();
            const locId = `admin-loc-${d.id}`;
            
            listContainer.innerHTML += `
            <div class="bg-white p-4 rounded-xl shadow border border-orange-100 mb-4">
                <div class="flex justify-between items-start">
                    <div>
                        <h3 class="font-bold text-lg">${pharma.shopName}</h3>
                        <p class="text-sm text-gray-600">📞 ${pharma.phone}</p>
                        <p class="text-xs text-gray-400 mt-1">📧 ${pharma.email}</p>
                        <p class="text-xs text-gray-500 mt-1">تاريخ التسجيل: ${timeAgo(pharma.createdAt)}</p>
                    </div>
                    <a href="${pharma.gpsLink}" target="_blank" class="text-blue-600 text-xs bg-blue-50 px-2 py-1 rounded">🗺️ الموقع</a>
                </div>
                
                <p id="${locId}" class="text-xs text-gray-500 my-2 bg-slate-50 p-2 rounded">جاري تحديد العنوان...</p>

                <div class="flex gap-2 mt-3">
                    <button onclick="window.approvePharma('${d.id}')" class="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-bold shadow hover:bg-green-700">✅ قبول وتفعيل</button>
                    <button onclick="window.rejectPharma('${d.id}')" class="flex-1 bg-red-100 text-red-600 py-2 rounded-lg text-sm font-bold hover:bg-red-200">🗑️ رفض وحذف</button>
                </div>
            </div>
            `;
            // محاولة جلب العنوان للعرض
            getLocationFromLink(pharma.gpsLink, locId);
        });
    });
}

// دوال الأدمن (Global Scope)
window.approvePharma = async (id) => {
    if(!confirm("هل أنت متأكد من تفعيل هذا الحساب؟")) return;
    try {
        await updateDoc(doc(db, "pharmacists", id), { isVerified: true });
        alert("تم تفعيل الحساب بنجاح ✅");
    } catch(e) { console.error(e); alert("خطأ في العملية"); }
};

window.rejectPharma = async (id) => {
    if(!confirm("⚠️ هل أنت متأكد من رفض وحذف هذا الطلب؟")) return;
    try {
        await deleteDoc(doc(db, "pharmacists", id));
        alert("تم رفض الطلب وحذفه 🗑️");
    } catch(e) { console.error(e); alert("خطأ في العملية"); }
};