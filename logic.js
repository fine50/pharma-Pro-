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
    /* شاشة تحميل تغطي الموقع بالكامل لمنع الوميض */
    #globalLoader { 
        position: fixed; inset: 0; background: #f8fafc; z-index: 99999; 
        display: flex; justify-content: center; align-items: center; transition: opacity 0.3s; 
    }
`;
document.head.appendChild(styleSheet);

// --- إنشاء وإضافة شاشة التحميل فوراً عند تشغيل الملف ---
const loaderDiv = document.createElement('div');
loaderDiv.id = 'globalLoader';
loaderDiv.innerHTML = '<div class="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-green-600"></div>';
document.body.appendChild(loaderDiv);

// دالة لإخفاء شاشة التحميل
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

// تحديد نوع الصفحة بناءً على عناصر فريدة فيها
const isDashPage = document.getElementById('ordersList'); // صفحة الصيدلي فقط
const isLoginPage = document.getElementById('sellerLoginBtn'); // صفحة الدخول

// القاعدة 1: إذا لم تكن في صفحة الداشبورد (أي أنت في الاندكس، الطلب، التتبع، الخ)، افتح الموقع فوراً
if (!isDashPage) {
    hideLoader();
}

// مراقبة المصادقة للتوجيه الصحيح
onAuthStateChanged(auth, (user) => {
    // القاعدة 2: إذا كنا في صفحة الدخول والمستخدم مسجل بالفعل -> حوله للداشبورد
    if (isLoginPage && user) {
        window.location.href = "dash.html";
        return;
    }

    // القاعدة 3: إذا كنا في صفحة الداشبورد
    if (isDashPage) {
        if (user) {
            // مسجل دخول: ابدأ بجلب البيانات (اللودر سيختفي لاحقاً عند اكتمال الجلب)
            initDashboard(user);
        } else {
            // غير مسجل: اطرده لصفحة الدخول
            window.location.href = "seller-login.html";
        }
    }
});

// ============================================================
// 4. دوال عامة (Global Helpers)
// ============================================================

// دالة رسم النجوم
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
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (!data.expiresAt) {
                const expiryDate = new Date();
                expiryDate.setHours(expiryDate.getHours() + 48); 
                await updateDoc(reqRef, { 
                    expiresAt: expiryDate,
                    interactionStarted: true 
                });
                console.log("Timer started: Order will disappear in 48 hours");
            }
        }
    } catch (e) {
        console.error("Error updating status:", e);
    }
};

// --- منطق التقييم ---
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

// دالة إرسال التقييم (Transaction)
window.submitReview = async () => {
    if(currentRating === 0) return alert("الرجاء اختيار عدد النجوم");
    const text = document.getElementById('reviewText').value;
    const btn = document.querySelector('#reviewModal button[onclick="window.submitReview()"]') || document.querySelector('#reviewModal button.btn-attention');
    
    if(!currentReviewPharmaId) return alert("خطأ في معرف الصيدلي");

    if(btn) { btn.innerText = "جاري الإرسال..."; btn.disabled = true; }

    try {
        const pharmaRef = doc(db, "pharmacists", currentReviewPharmaId);
        
        await runTransaction(db, async (transaction) => {
            const pharmaDoc = await transaction.get(pharmaRef);
            if (!pharmaDoc.exists()) throw "Pharmacist not found";

            const data = pharmaDoc.data();
            const oldRating = data.rating || 0;
            const oldCount = data.reviewCount || 0;

            const newCount = oldCount + 1;
            const newRating = ((oldRating * oldCount) + currentRating) / newCount;

            transaction.update(pharmaRef, {
                rating: newRating,
                reviewCount: newCount
            });

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
    } catch (e) {
        console.error(e);
        alert("حدث خطأ أثناء التقييم");
    } finally {
        if(btn) { btn.innerText = "إرسال التقييم"; btn.disabled = false; }
    }
};

async function getLocationFromLink(gpsLink, elementId) {
    if (!gpsLink || !gpsLink.includes("q=")) return;
    try {
        const coords = gpsLink.split("q=")[1].split(",");
        const lat = coords[0];
        const lng = coords[1];
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
        const data = await response.json();
        const city = data.address.city || data.address.town || data.address.village || data.address.county || "";
        const suburb = data.address.suburb || data.address.neighbourhood || "";
        const locationText = suburb ? `${city} - ${suburb}` : city;
        const elem = document.getElementById(elementId);
        if(elem && locationText) {
            elem.innerText = locationText;
            if(elem.classList.contains("text-gray-500")) {
                 elem.classList.add("text-slate-800", "font-bold");
                 elem.classList.remove("text-gray-500");
            }
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

    document.getElementById('submitBtn').addEventListener('click', async () => {
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
    trackBtn.addEventListener('click', async () => {
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
                        if(pharmaSnap.exists()) {
                            pharmaRating = pharmaSnap.data().rating || 0;
                        }
                    } catch(e) { console.log("Error fetching rating"); }

                    const starsHTML = window.getStarRatingHTML(pharmaRating);

                    list.innerHTML += `
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm mb-4 hover:shadow-md transition-all">
                        <div class="flex justify-between items-start mb-3">
                            <div>
                                <h3 class="font-black text-slate-800 text-lg">${r.pharmaName}</h3>
                                ${starsHTML}
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
// 7. منطق تسجيل الدخول للصيدلي
// ============================================================
const sellerLoginBtn = document.getElementById('sellerLoginBtn');
if (sellerLoginBtn) {
    sellerLoginBtn.addEventListener('click', async () => {
        const email = document.getElementById('loginEmail').value;
        const pass = document.getElementById('loginPassword').value;
        
        if (!email || !pass) return alert("أدخل البيانات");
        
        sellerLoginBtn.innerText = "جاري الدخول...";
        
        try {
            // هذا السطر هو الأهم: يأمر المتصفح بحفظ الجلسة في الذاكرة الدائمة
            await setPersistence(auth, browserLocalPersistence);
            
            // بعدها نقوم بتسجيل الدخول
            await signInWithEmailAndPassword(auth, email, pass);
            
            // لا نحتاج للتوجيه يدوياً، onAuthStateChanged ستقوم بذلك
        } catch (e) {
            console.error(e);
            alert("خطأ في الدخول: تأكد من الإيميل وكلمة السر");
            sellerLoginBtn.innerText = "دخول للوحة التحكم";
        }
    });

    const authBtn = document.getElementById('authBtn');
    if (authBtn) {
        authBtn.addEventListener('click', async () => {
            const btn = document.getElementById('authBtn');
            const email = document.getElementById('email').value;
            const pass = document.getElementById('password').value;
            const shopName = document.getElementById('shopName').value;
            const phone = document.getElementById('phone').value;
            const gpsLink = document.getElementById('gpsLink').value;
            if(!shopName || !phone || !gpsLink) return alert("جميع البيانات مطلوبة");
            btn.innerText = "جاري الإنشاء...";
            try {
                const cred = await createUserWithEmailAndPassword(auth, email, pass);
                await setDoc(doc(db, "pharmacists", cred.user.uid), {
                    shopName, phone, email, gpsLink, wilaya: "موقع GPS", isVerified: false, isBlocked: false, createdAt: serverTimestamp()
                });
                alert("تم التسجيل!"); window.location.reload();
            } catch(e) { alert("خطأ: " + e.message); btn.innerText = "إنشاء حساب جديد"; }
        });
    }

    const btnSendReset = document.getElementById('btnSendReset');
    if (btnSendReset) {
        btnSendReset.addEventListener('click', async () => {
            const email = document.getElementById('forgotEmail').value;
            if (!email) return alert("الرجاء كتابة البريد الإلكتروني لاستعادة كلمة المرور");
            
            const originalText = btnSendReset.innerText;
            btnSendReset.innerText = "جاري الإرسال...";
            btnSendReset.disabled = true;

            try {
                await sendPasswordResetEmail(auth, email);
                alert("تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني!");
                window.closeForgotModal(); 
            } catch (error) {
                console.error(error);
                if (error.code === 'auth/user-not-found') {
                    alert("هذا البريد الإلكتروني غير مسجل لدينا ❌");
                } else if (error.code === 'auth/invalid-email') {
                    alert("البريد الإلكتروني غير صحيح ❌");
                } else {
                    alert("حدث خطأ: " + error.message);
                }
            } finally {
                btnSendReset.innerText = originalText;
                btnSendReset.disabled = false;
            }
        });
    }
}

// ============================================================
// 8. منطق لوحة تحكم الصيدلي (DASH.HTML) - (معدل للتحقق من التفعيل)
// ============================================================
let currentPharmaId = null;
let currentPharmaData = null;

// دالة للخروج الفوري واستخدامها في شاشة الانتظار
window.logoutNow = async () => {
    await signOut(auth);
    window.location.href = "seller-login.html";
};

async function initDashboard(user) {
    currentPharmaId = user.uid;
    const pharmaRef = doc(db, "pharmacists", user.uid);
    
    // 1. جلب البيانات مرة واحدة للتحقق من حالة الحساب قبل عرض أي شيء
    try {
        const docSnap = await getDoc(pharmaRef);
        
        if (!docSnap.exists()) {
            alert("خطأ: حسابك غير موجود في قاعدة البيانات!");
            window.logoutNow();
            return;
        }
        
        const data = docSnap.data();
        
        // 2. التحقق: هل الحساب مفعل (isVerified == true)؟
        if (data.isVerified === false) {
            hideLoader(); // إخفاء لودر التحميل لعرض الرسالة
            
            // استبدال محتوى الصفحة برسالة "قيد المراجعة"
            document.body.innerHTML = `
<div style="min-height:100vh; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; background:#f8fafc; font-family:sans-serif; padding:20px;">
    <div style="font-size:60px; margin-bottom:20px;">⏳</div>
    <h2 style="color:#1e293b; margin:0 0 10px; font-size:24px; font-weight:bold;">الحساب قيد المراجعة</h2>
    <p style="color:#64748b; max-width:400px; line-height:1.6; font-size:16px;">
        مرحباً <strong>${data.shopName}</strong>،<br>
        تم تسجيل طلبك بنجاح. يقوم فريق العمل حالياً بالتحقق من بيانات الصيدلية.<br>
        يرجى الانتظار حتى يتم تفعيل حسابك من قبل الإدارة.
    </p>
    <div style="margin-top:30px; display:flex; gap:10px;">
        <button onclick="window.location.reload()" style="padding:12px 24px; background:#0f172a; color:white; border:none; border-radius:12px; cursor:pointer; font-weight:bold;">🔄 تحديث الحالة</button>
        <button onclick="window.logoutNow()" style="padding:12px 24px; background:#fee2e2; color:#ef4444; border:none; border-radius:12px; cursor:pointer; font-weight:bold;">تسجيل خروج</button>
    </div>
</div>
`;
            return; // توقف هنا ولا تكمل الكود
        }
        
        // 3. التحقق: هل الحساب محظور؟
        if (data.isBlocked === true) {
            alert("عذراً، تم تعطيل هذا الحساب من قبل الإدارة.");
            window.logoutNow();
            return;
        }
        
        // ============================================================
        // 4. إذا وصل لهنا، الحساب مفعل -> ابدأ تشغيل الداشبورد
        // ============================================================
        
        // مراقبة التحديثات الحية (النجوم والاسم) لتبقى محدثة دائماً
        onSnapshot(pharmaRef, (snap) => {
            if (snap.exists()) {
                currentPharmaData = snap.data();
                
                // تحقق أمني: إذا قام الأدمن بحظره وهو يتصفح
                if (currentPharmaData.isBlocked || currentPharmaData.isVerified === false) {
                    window.location.reload();
                }
                
                if (document.getElementById('headerShopName'))
                    document.getElementById('headerShopName').innerText = currentPharmaData.shopName;
                
                if (document.getElementById('pharmaLocationDisplay') && currentPharmaData.gpsLink) {
                    getLocationFromLink(currentPharmaData.gpsLink, 'pharmaLocationDisplay');
                }
                
                if (document.getElementById('pharmaStarsDisplay')) {
                    const rating = currentPharmaData.rating || 0;
                    const count = currentPharmaData.reviewCount || 0;
                    document.getElementById('pharmaStarsDisplay').innerHTML = window.getStarRatingHTML(rating) + `<span class="text-[9px] text-gray-400 mr-1">(${count} تقييم)</span>`;
                }
            }
            hideLoader();
        });
        
        performWeeklyCleanup();
        startDashboardListeners();
        
    } catch (error) {
        console.error("Error fetching account data:", error);
        alert("حدث خطأ في الاتصال، حاول مرة أخرى.");
        hideLoader();
    }
}

const performWeeklyCleanup = async () => {
    try {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 7); 
        const reqQuery = query(collection(db, "requests"), where("createdAt", "<", cutoff));
        const reqSnap = await getDocs(reqQuery);
        const resQuery = query(collection(db, "responses"), where("createdAt", "<", cutoff));
        const resSnap = await getDocs(resQuery);

        if (reqSnap.empty && resSnap.empty) return; 

        const batch = writeBatch(db);
        reqSnap.forEach(d => batch.delete(d.ref));
        resSnap.forEach(d => batch.delete(d.ref));

        await batch.commit();
        console.log("Weekly cleanup performed.");
    } catch (e) {
        console.error("Cleanup error:", e);
    }
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
                
                // --- تم إضافة رقم هاتف المريض هنا كما طلبت ---
                list.innerHTML += `
                <div class="bg-white p-6 rounded-[2rem] shadow-lg border border-slate-100 relative overflow-hidden transition-all hover:shadow-xl">
                    
                    <div class="mb-4 space-y-2">
                        <div class="flex justify-between items-start">
                            <h3 class="font-black text-slate-800 text-xl leading-tight">${req.medName}</h3>
                            <span class="text-[10px] text-gray-400 font-mono bg-slate-50 px-2 py-1 rounded-lg">${timeAgo(req.createdAt)}</span>
                        </div>
                        
                        <p class="text-xs text-green-600 font-bold flex items-center gap-1">
                            📍 <span class="text-slate-600">${req.wilaya}</span>
                        </p>

                        <!-- رقم المريض -->
                        <a href="tel:${req.phoneNumber}" class="block w-fit text-xs text-blue-600 font-bold bg-blue-50 px-2 py-1 rounded-lg border border-blue-100 hover:bg-blue-100 transition mt-2">
                            📞 هاتف المريض: <span class="font-mono dir-ltr">${req.phoneNumber}</span>
                        </a>
                        
                        ${req.notes ? `
                            <div class="bg-orange-50 border-r-2 border-orange-200 p-3 rounded-l-xl mt-2">
                                <p class="text-xs text-slate-600 leading-relaxed">📝 ${req.notes}</p>
                            </div>
                        ` : ''}

                        <div class="mt-3 text-[9px] text-gray-400 font-medium leading-tight border-t border-dashed border-gray-100 pt-2">
                            ⚠️ تنبيه: سيتم حذف الطلب تلقائياً بعد <span class="text-red-400 font-bold">48 ساعة</span> من بدء تواصل المريض معك.
                        </div>
                        
                        ${req.interactionStarted ? `<div class="mt-1 text-[9px] text-red-500 font-bold animate-pulse">⏳ العد التنازلي للحذف بدأ بالفعل!</div>` : ''}
                    </div>

                    <div class="flex flex-col gap-3 mt-4">
                        ${req.imageUrl ? 
                            `<button onclick="window.openLightbox('${req.imageUrl}')" class="w-full bg-slate-800 text-white py-3.5 rounded-xl text-xs font-bold shadow-md hover:bg-slate-700 transition flex items-center justify-center gap-2">
                                <span>📷</span> عرض الوصفة الطبية
                            </button>` 
                            : 
                            `<div class="w-full bg-slate-50 text-gray-400 py-3 rounded-xl text-[10px] font-bold text-center border border-slate-100">🚫 لا توجد صورة مرفقة</div>`
                        }

                        <button onclick="window.respondToRequest('${d.id}')" class="w-full bg-green-600 text-white py-4 rounded-xl text-sm font-black shadow-lg shadow-green-200 hover:bg-green-700 hover:shadow-xl transition active:scale-[0.98] flex items-center justify-center gap-2">
                            <span>✅</span> هذا الدواء متوفر عندي
                        </button>
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
        list.innerHTML += `<div class="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm mb-2 opacity-75"><p class="text-xs font-bold text-gray-800">قمت بالرد على طلب (ID: ${r.requestId.substr(0,5)})</p><span class="text-[10px] text-gray-400">${timeAgo(r.createdAt)}</span></div>`;
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
    if(!user) return alert("حدث خطأ في الجلسة، قم بتسجيل الخروج والدخول مجدداً");

    try {
        const cred = EmailAuthProvider.credential(user.email, oldPass);
        await reauthenticateWithCredential(user, cred);
        await updatePassword(user, newPass);
        alert("تم تغيير كلمة المرور بنجاح ✅");
        document.getElementById('oldPass').value = "";
        document.getElementById('newPass').value = "";
        document.getElementById('confirmPass').value = "";
        document.getElementById('passFieldsContainer').classList.add('hidden');
    } catch(e) {
        console.error(e);
        if(e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
            alert("كلمة المرور الحالية غير صحيحة ❌");
        } else {
            alert("حدث خطأ: " + e.message);
        }
    }
};

window.respondToRequest = async (requestId) => {
    // التأكد أن بيانات الصيدلية قد تم تحميلها
    if (!currentPharmaData) {
        alert("انتظر لحظة حتى يتم تحميل بياناتك، ثم حاول مرة أخرى.");
        return;
    }
    
    const notes = prompt("ملاحظة للمريض (مثال: السعر، الكمية، أو 'تعال الآن'):");
    if (notes === null) return; // تم إلغاء الأمر
    
    try {
        // نستخدم (||) لمنع توقف الكود إذا كانت إحدى المعلومات غير مسجلة
        await addDoc(collection(db, "responses"), {
            requestId: requestId,
            pharmaId: currentPharmaId,
            pharmaName: currentPharmaData.shopName || "صيدلية",
            phone: currentPharmaData.phone || "",
            wilaya: currentPharmaData.wilaya || "غير محدد",
            baladiya: currentPharmaData.baladiya || "غير محدد",
            gpsLink: currentPharmaData.gpsLink || "",
            notes: notes,
            createdAt: serverTimestamp()
        });
        
        alert("تم إرسال ردك للمريض! ✅");
        
    } catch (e) {
        console.error("Error details:", e);
        // عرض الخطأ بالتفصيل لنعرف السبب إذا تكرر
        alert("فشل الإرسال: " + e.message);
    }
};