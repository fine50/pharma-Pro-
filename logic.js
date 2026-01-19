import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updatePassword, onAuthStateChanged, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
// تمت إضافة getDocFromServer هنا في الاستدعاءات
import { getFirestore, collection, addDoc, getDoc, getDocFromServer, setDoc, doc, updateDoc, deleteDoc, query, where, orderBy, onSnapshot, serverTimestamp, writeBatch, getDocs, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ============================================================
// 1. الإعدادات (Configuration)
// ============================================================
const firebaseConfig = {
    apiKey: "AIzaSyDKuuVspUv3_IzjxQFMqG-2JucCkgt4pvY",
    authDomain: "pharma-45f21.firebaseapp.com",
    databaseURL: "https://pharma-45f21-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "pharma-45f21",
    storageBucket: "pharma-45f21.firebasestorage.app",
    messagingSenderId: "81580143218",
    appId: "1:81580143218:web:1b15394de65f0bf00308eb"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// تثبيت الجلسة (Local Persistence)
setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.error("Auth Persistence Error:", error);
});

// ============================================================
// 2. المتغيرات العامة (Global State)
// ============================================================
let isFirstLoad = true; 
let currentReviewPharmaId = null;
let currentReviewReqId = null;
let currentReviewRating = 0;
let currentOfferReqId = null; // لتخزين معرف الطلب عند فتح نافذة السعر
let currentUserProfile = null; // لتخزين بيانات الصيدلي المسجل حالياً للتحقق

// ============================================================
// 3. أدوات مساعدة (Helpers & Utilities)
// ============================================================

// دالة تسجيل العمليات (Audit Trail)
async function logAction(actionType, details, userId = null) {
    try {
        await addDoc(collection(db, "system_logs"), {
            action: actionType,
            details: details,
            userId: userId || (auth.currentUser ? auth.currentUser.uid : "anonymous"),
            timestamp: serverTimestamp()
        });
    } catch (e) { console.error("Log Error", e); }
}

const safeToggle = (id, action) => {
    const el = document.getElementById(id);
    if (el) {
        if (action === 'show') {
            el.classList.remove('hidden');
            // معالجة الأنيميشن للمودالز
            if(el.classList.contains('help-modal') || el.id === 'reviewModal' || el.id === 'offerModal') {
                setTimeout(() => el.classList.add('active'), 10);
            }
        } else {
            el.classList.add('hidden');
            if(el.classList.contains('help-modal') || el.id === 'reviewModal' || el.id === 'offerModal') {
                el.classList.remove('active');
            }
        }
    }
};

// --- إنشاء Lightbox للصور (للتكبير) ---
function createLightbox() {
    if (document.getElementById('imgLightbox')) return;
    const box = document.createElement('div');
    box.id = 'imgLightbox';
    box.className = 'fixed inset-0 z-[9999] bg-black/95 hidden flex justify-center items-center cursor-zoom-out backdrop-blur-sm animate-fade-in';
    
    // عند الضغط في أي مكان يغلق، إلا الصورة
    box.onclick = (e) => {
        if (e.target !== document.getElementById('lightboxImg')) box.classList.add('hidden');
    };
    
    box.innerHTML = `
        <div class="relative max-w-[95%] max-h-[95%]">
            <button onclick="document.getElementById('imgLightbox').classList.add('hidden')" class="absolute -top-12 right-0 text-white bg-red-600 hover:bg-red-700 rounded-full p-2 transition shadow-lg z-50">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
            <img id="lightboxImg" src="" class="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl border border-gray-700">
        </div>`;
    document.body.appendChild(box);
}
createLightbox();

// دالة فتح الصورة
window.openLightbox = (src) => {
    if (!src) return;
    const box = document.getElementById('imgLightbox');
    const img = document.getElementById('lightboxImg');
    if(img && box) {
        img.src = src;
        box.classList.remove('hidden');
    }
};

// --- إنشاء نافذة تقديم العرض للصيدلي (Modal) ---
function createOfferModal() {
    if (document.getElementById('offerModal')) return;
    
    const modal = document.createElement('div');
    modal.id = 'offerModal';
    modal.className = 'fixed inset-0 z-[9999] hidden flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-opacity duration-300 opacity-0';
    
    modal.onclick = (e) => { if(e.target === modal) safeToggle('offerModal', 'hide'); };
    
    modal.innerHTML = `
        <div class="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl p-6 relative transform transition-transform scale-95 animate-slide-up">
            <button onclick="document.getElementById('offerModal').classList.add('hidden')" class="absolute top-4 left-4 text-gray-300 hover:text-red-500 transition">✕</button>
            
            <div class="text-center mb-6">
                <div class="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-3 border border-green-100">
                    <span class="text-3xl">💰</span>
                </div>
                <h3 class="text-xl font-bold text-slate-800">تحديد السعر</h3>
                <p class="text-xs text-gray-400">أدخل عرضك للمريض</p>
            </div>
            
            <div class="space-y-4">
                <div>
                    <label class="block text-xs font-bold text-gray-500 mb-1 text-right">السعر (دج)</label>
                    <input type="number" id="modalPrice" class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-center text-lg font-bold focus:border-green-500 outline-none transition placeholder-gray-300" placeholder="0000">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 mb-1 text-right">ملاحظة إضافية (اختياري)</label>
                    <input type="text" id="modalNote" class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:border-green-500 outline-none transition text-right" placeholder="مثال: متوفر البديل">
                </div>
                <button onclick="window.submitOffer()" class="w-full bg-slate-800 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-slate-900 transition active:scale-95">
                    إرسال العرض
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}
createOfferModal();

const compressImage = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let MAX_WIDTH = 800; 
                let quality = 0.6;
                if (file.size > 2 * 1024 * 1024) { MAX_WIDTH = 600; quality = 0.5; }
                const scaleSize = MAX_WIDTH / img.width;
                if (img.width > MAX_WIDTH) { canvas.width = MAX_WIDTH; canvas.height = img.height * scaleSize; } 
                else { canvas.width = img.width; canvas.height = img.height; }
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });
};

function timeAgo(t) {
    if(!t) return "";
    const s = Math.floor((new Date() - t.toDate())/1000);
    if(s>3600) return Math.floor(s/3600) + " س";
    if(s>60) return Math.floor(s/60) + " د";
    return "الآن";
}

function generateStars(rating) {
    const r = parseFloat(rating) || 0;
    let html = '';
    for(let i=1; i<=5; i++) {
        html += i <= r ? '<span class="text-yellow-400">★</span>' : '<span class="text-gray-300">★</span>';
    }
    return `${html} <span class="text-xs text-gray-400">(${r.toFixed(1)})</span>`;
}

// ============================================================
// 4. منطق المريض (CUSTOMER / PATIENT SIDE)
// ============================================================

// --- أ) صفحة إرسال الطلب (index.html) ---
if (document.getElementById('btnSubmitOrder')) {
    
    let uploadedPrescriptionBase64 = null;
    const prescriptionInput = document.getElementById('prescriptionImage');
    const prescriptionPreview = document.getElementById('imagePreview');

    if (prescriptionInput) {
        prescriptionInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    uploadedPrescriptionBase64 = await compressImage(file);
                    if(prescriptionPreview) {
                        prescriptionPreview.src = uploadedPrescriptionBase64;
                        prescriptionPreview.classList.remove('hidden'); 
                        prescriptionPreview.onclick = () => window.openLightbox(uploadedPrescriptionBase64);
                    }
                } catch(err) { console.error(err); alert("حدث خطأ في الصورة"); }
            }
        });
    }

    const btnSubmitOrder = document.getElementById('btnSubmitOrder');
    btnSubmitOrder.addEventListener('click', async () => {
        const medName = document.getElementById('medicineName').value.trim();
        const wilaya = document.getElementById('wilaya').value;
        const phone = document.getElementById('phoneNumber').value.trim();
        const notes = document.getElementById('notes') ? document.getElementById('notes').value.trim() : "";
        
        if (!medName || !phone || !wilaya) return alert("الرجاء إدخال اسم الدواء، الولاية ورقم الهاتف.");
        
        const originalText = btnSubmitOrder.innerHTML;
        btnSubmitOrder.disabled = true;
        btnSubmitOrder.innerHTML = `<span>جاري الإرسال...</span>`;
        
        const code = Math.floor(1000 + Math.random() * 9000).toString();
        
        try {
            await addDoc(collection(db, "requests"), {
                medicineName: medName,
                wilaya: wilaya,
                phoneNumber: phone,
                notes: notes,
                prescriptionUrl: uploadedPrescriptionBase64 || null,
                secretCode: code,
                status: "pending", 
                patientId: auth.currentUser ? auth.currentUser.uid : "guest",
                winnerOfferId: null,
                createdAt: serverTimestamp()
            });

            await logAction('create_request', `Request for ${medName} created`);
            
            const codeDisplay = document.getElementById('secretCodeDisplay');
            if(codeDisplay) codeDisplay.innerText = code;

            const formScreen = document.getElementById('formScreen');
            const successScreen = document.getElementById('successScreen');
            
            if(formScreen) formScreen.style.display = 'none';
            if(successScreen) {
                successScreen.classList.remove('hidden');
                successScreen.style.display = 'flex';
            }
            
            window.scrollTo({ top: 0, behavior: 'smooth' });

        } catch (e) {
            console.error(e);
            alert("حدث خطأ أثناء الإرسال: " + e.message);
            btnSubmitOrder.disabled = false;
            btnSubmitOrder.innerHTML = originalText;
        }
    });
}

// --- ب) صفحة التتبع (track.html) ---
if (document.getElementById('trackBtn')) {
    const btnTrack = document.getElementById('trackBtn');
    
    btnTrack.addEventListener('click', () => {
        const phone = document.getElementById('trackPhone').value.trim();
        const code = document.getElementById('trackCode').value.trim();
        
        if(!phone || !code) return alert("يرجى إدخال رقم الهاتف والرمز السري");
        
        const originalText = btnTrack.innerText;
        btnTrack.innerText = "جاري البحث...";
        btnTrack.disabled = true;
        
        const q = query(collection(db, "requests"), where("phoneNumber", "==", phone), where("secretCode", "==", code));
        
        onSnapshot(q, (snap) => {
            btnTrack.innerText = originalText;
            btnTrack.disabled = false;
            
            if(snap.empty) {
                alert("عذراً، لم يتم العثور على طلب بهذا الرقم والكود.");
                return;
            }
            
            safeToggle('loginSection', 'hide'); 
            safeToggle('dashboardSection', 'show');

            const reqDoc = snap.docs[0];
            const reqData = reqDoc.data();
            const requestId = reqDoc.id;
            
            const titleEl = document.getElementById('orderTitle');
            if(titleEl) {
                let statusText = "";
                if(reqData.status === 'pending') statusText = " (قيد الانتظار)";
                else if(reqData.status === 'completed') statusText = " (مكتمل)";
                
                titleEl.innerText = reqData.medicineName + statusText;
            }
            
            // الاستماع للردود (Offers)
            const respQ = query(collection(db, "responses"), where("requestId", "==", requestId));
            
            onSnapshot(respQ, (respSnap) => {
                const list = document.getElementById('offersList');
                if(!list) return;
                list.innerHTML = "";
                
                if(respSnap.empty) {
                    list.innerHTML = `
                    <div class="bg-slate-50 rounded-2xl p-8 text-center border border-dashed border-slate-300">
                        <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                            <span class="text-2xl">⏳</span>
                        </div>
                        <p class="text-lg font-bold mb-2 text-slate-500">في انتظار الصيادلة...</p>
                        <p class="text-xs text-gray-400">سيظهر هنا أي عرض فور وصوله.</p>
                    </div>`;
                    return;
                }
                
                respSnap.forEach(d => {
                    const r = d.data();
                    let mapLink = r.gpsLink || (r.location ? `https://www.google.com/maps?q=${r.location.lat},${r.location.lng}` : "#");

                    // زر التقييم يظهر دائماً الآن بدلاً من زر القبول
                    // قمنا بتغيير النص والوظيفة
                    let actionButton = '';
                    if (reqData.status !== 'completed') {
                        actionButton = `
                        <button onclick="window.prepareReview('${r.pharmacyId}', '${requestId}', '${r.pharmacyName}', '${r.location ? 'محدد' : 'غير محدد'}')" class="w-full mt-2 bg-green-600 text-white font-bold py-3 rounded-xl shadow-lg hover:bg-green-700 transition active:scale-95 flex items-center justify-center gap-2">
                             <span>⭐</span>
                             <span>هل اشتريت الدواء؟ قيّم الصيدلية</span>
                        </button>`;
                    } else if (reqData.status === 'completed' && reqData.winnerOfferId === d.id) {
                         actionButton = `<div class="mt-2 bg-green-100 text-green-800 text-center py-2 rounded-xl font-bold border border-green-200">✅ عملية مكتملة</div>`;
                    }

                    list.innerHTML += `
                    <div class="bg-white p-5 rounded-2xl shadow-lg border border-gray-100 mb-4 animate-slide-up relative overflow-hidden group hover:border-green-200 transition">
                        <div class="absolute top-0 right-0 w-1.5 h-full bg-green-500"></div>

                        <div class="flex justify-between items-start mb-4 pl-2">
                            <div>
                                <h3 class="font-bold text-gray-800 text-lg flex items-center gap-2">
                                    🏥 ${r.pharmacyName}
                                </h3>
                                <div class="flex items-center gap-1 mt-1">
                                    ${generateStars(r.pharmaRating || 0)} 
                                </div>
                            </div>
                            <div class="text-center">
                                <span class="block text-[10px] text-gray-400 mb-1">السعر المعروض</span>
                                <span class="block text-xl font-black text-green-600 bg-green-50 px-3 py-1 rounded-xl border border-green-100 shadow-sm">
                                    ${r.price ? r.price : '---'} <span class="text-xs font-bold">دج</span>
                                </span>
                            </div>
                        </div>

                        <div class="bg-slate-50 p-4 rounded-xl mb-4 text-sm text-gray-700 border border-slate-100">
                            <div class="flex items-center gap-2 mb-2">
                                <span class="text-lg">💊</span>
                                <span>الدواء: <b class="text-slate-900">${reqData.medicineName}</b></span>
                            </div>
                            ${r.notes ? `
                            <div class="mt-2 pt-2 border-t border-slate-200 flex items-start gap-2">
                                <span class="text-lg">📝</span>
                                <span class="text-xs text-slate-600 font-medium leading-relaxed">${r.notes}</span>
                            </div>` : ''}
                        </div>

                        <div class="grid grid-cols-2 gap-3 mt-2">
                            <a href="tel:${r.pharmacyPhone}" class="flex flex-col items-center justify-center gap-1 bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-900 transition shadow-lg active:scale-95">
                                <span class="text-lg">📞</span>
                                <span class="text-xs">اتصال مباشر</span>
                            </a>
                            <a href="${mapLink}" target="_blank" class="flex flex-col items-center justify-center gap-1 bg-blue-50 text-blue-600 py-3 rounded-xl font-bold hover:bg-blue-100 transition border border-blue-200 active:scale-95">
                                <span class="text-lg">📍</span>
                                <span class="text-xs">موقع الصيدلية</span>
                            </a>
                        </div>
                        
                        ${actionButton}
                    </div>`;
                });
            });
        });
    });

    // --- منطق التقييم (تم تحديثه لإخفاء خانة النص وإرسال النجوم فقط) ---
    window.prepareReview = (pharmaId, reqId, pharmaName, wilaya) => {
        currentReviewPharmaId = pharmaId;
        currentReviewReqId = reqId;
        currentReviewRating = 0;
        
        if(document.getElementById('reviewSellerName')) document.getElementById('reviewSellerName').innerText = pharmaName;
        if(document.getElementById('reviewSellerWilaya')) document.getElementById('reviewSellerWilaya').innerText = wilaya;
        
        // إخفاء خانة النص إذا كانت موجودة في HTML
        const textArea = document.getElementById('reviewText'); // أو whatever id you have
        if(textArea) textArea.style.display = 'none'; // نخفيها برمجياً لضمان عدم الكتابة

        updateStarDisplay(0);
        
        const modal = document.getElementById('reviewModal');
        if(modal) {
            modal.classList.remove('hidden');
            setTimeout(() => modal.classList.add('active'), 10);
        }
    };

    window.setStars = (n) => {
        currentReviewRating = n;
        updateStarDisplay(n);
    };

    function updateStarDisplay(n) {
        const container = document.getElementById('starContainer');
        if(!container) return;
        const spans = container.children;
        for(let i=0; i<spans.length; i++) {
            if(i < n) {
                spans[i].classList.add('text-orange-500');
                spans[i].classList.remove('text-gray-600'); 
            } else {
                spans[i].classList.remove('text-orange-500');
                spans[i].classList.add('text-gray-600'); 
            }
        }
    }

    // دالة إرسال التقييم (نجوم فقط) وإنهاء الطلب
    window.submitReview = async () => {
    if (currentReviewRating === 0) return alert("الرجاء اختيار عدد النجوم");
    
    const btn = document.getElementById('submitReviewBtn');
    const originalText = btn.innerText;
    btn.innerText = "جاري الحساب...";
    btn.disabled = true;
    
    try {
        // 1. جلب بيانات الصيدلي الحالية لحساب المعدل
        const pharmaRef = doc(db, "pharmacists", currentReviewPharmaId);
        const pharmaSnap = await getDoc(pharmaRef);
        
        if (pharmaSnap.exists()) {
            const pData = pharmaSnap.data();
            
            // المعادلة: (التقييم القديم * العدد القديم + التقييم الجديد) / (العدد القديم + 1)
            const oldRating = pData.rating || 0;
            const oldCount = pData.reviewCount || 0;
            const newCount = oldCount + 1;
            
            let newAvg = ((oldRating * oldCount) + currentReviewRating) / newCount;
            // تقريب الرقم لمنزلة عشرية واحدة
            newAvg = Math.round(newAvg * 10) / 10;
            
            // تحديث ملف الصيدلي
            await updateDoc(pharmaRef, {
                rating: newAvg,
                reviewCount: newCount
            });
        }
        
        // 2. حفظ التقييم في السجل
        await addDoc(collection(db, "reviews"), {
            pharmaId: currentReviewPharmaId,
            reqId: currentReviewReqId,
            stars: currentReviewRating,
            createdAt: serverTimestamp()
        });
        
        // 3. تحديث حالة الطلب إلى مكتمل
        await updateDoc(doc(db, "requests", currentReviewReqId), {
            status: "completed",
            winnerOfferId: currentReviewPharmaId
        });
        
        // 4. جعل العرض فائزاً
        const offersQ = query(collection(db, "responses"),
            where("requestId", "==", currentReviewReqId),
            where("pharmacyId", "==", currentReviewPharmaId));
        const offerSnap = await getDocs(offersQ);
        if (!offerSnap.empty) {
            await updateDoc(doc(db, "responses", offerSnap.docs[0].id), { isWinner: true });
        }
        
        alert("تم تقييم الصيدلية بنجاح!");
        
        // إغلاق المودال
        const modal = document.getElementById('reviewModal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => modal.classList.add('hidden'), 300);
        }
        
    } catch (e) {
        console.error(e);
        alert("حدث خطأ: " + e.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
};
}

// ============================================================
// 5. منطق الصيدلي (PHARMACIST) - تسجيل الدخول والتحقق
// ============================================================
if (document.getElementById('sellerLoginBtn') || document.getElementById('authBtn')) {

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // منع الأدمن من الدخول هنا
            if (user.email === "david_hassan5@hotmail.com") {
                window.location.href = "admin.html";
                return;
            }

            // Auth Guard: التحقق من حالة التوثيق والحظر قبل تحويله
            // تم التعديل: استخدام getDocFromServer لضمان جلب البيانات الحديثة وتجاهل الكاش
            try {
                const userDoc = await getDocFromServer(doc(db, "pharmacists", user.uid));
                
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    if (!userData.isVerified) {
                        alert("حسابك قيد المراجعة من قبل الإدارة. يرجى الانتظار حتى يتم تفعيل حسابك.");
                        await signOut(auth);
                        return;
                    }
                    if (userData.isBlocked) {
                        alert("عذراً، تم حظر حسابك. يرجى مراجعة الإدارة.");
                        await signOut(auth);
                        return;
                    }
                    // إذا كان موثقاً وغير محظور -> لوحة التحكم
                    window.location.href = "dash.html"; 
                } else {
                    // مستخدم مسجل لكن لا يوجد له ملف في pharmacists (نادر الحدوث)
                    await signOut(auth);
                }
            } catch(e) {
                console.error("Error fetching user data:", e);
                // في حال انقطاع النت أو الخطأ، نسمح بالخروج
                // alert("حدث خطأ في الاتصال بالسيرفر"); 
            }
        }
    });

    const sellerLoginBtn = document.getElementById('sellerLoginBtn');
    if (sellerLoginBtn) {
        sellerLoginBtn.addEventListener('click', async () => {
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            if(!email || !password) return alert("املأ البيانات");
            
            try {
                sellerLoginBtn.innerText = "جاري التحقق...";
                await signInWithEmailAndPassword(auth, email, password);
                // سيقوم onAuthStateChanged بالباقي
            } catch(e) {
                console.error(e);
                alert("خطأ في الدخول: تأكد من البريد وكلمة المرور.");
                sellerLoginBtn.innerText = "دخول";
            }
        });
    }

    const authBtn = document.getElementById('authBtn');
    if (authBtn) {
        authBtn.addEventListener('click', async () => {
            const shopName = document.getElementById('shopName').value.trim();
            const email = document.getElementById('email').value.trim();
            const phone = document.getElementById('phone').value.trim();
            const password = document.getElementById('password').value;
            const gpsLink = document.getElementById('gpsLink').value;
            
            if (!shopName || !email || !phone || !password) return alert("جميع الحقول مطلوبة");
            if (!gpsLink) return alert("يجب تحديد الموقع (GPS)");
            
            const originalText = authBtn.innerText;
            authBtn.innerText = "جاري التسجيل...";
            authBtn.disabled = true;
            
            try {
                const phoneQuery = query(collection(db, "pharmacists"), where("phone", "==", phone));
                const phoneSnap = await getDocs(phoneQuery);
                
                if (!phoneSnap.empty) {
                    throw new Error("رقم الهاتف مستخدم بالفعل لحساب آخر.");
                }
                
                const cred = await createUserWithEmailAndPassword(auth, email, password);
                
                let loc = { lat: 0, lng: 0, link: gpsLink };
                try {
                    if (gpsLink.includes("q=")) {
                        const parts = gpsLink.split("q=")[1].split(",");
                        loc.lat = parseFloat(parts[0]);
                        loc.lng = parseFloat(parts[1]);
                    }
                } catch (err) {
                    console.log("GPS parsing error (ignored):", err);
                }
                
                await setDoc(doc(db, "pharmacists", cred.user.uid), {
                    shopName: shopName,
                    email: email,
                    phone: phone,
                    gpsLink: gpsLink,
                    location: loc,
                    isVerified: false, 
                    isBlocked: false,
                    rating: 0,
                    reviewCount: 0,
                    createdAt: serverTimestamp()
                });
                
                if (typeof logAction === 'function') {
                    await logAction('register_pharma', `New pharmacist registered: ${shopName}`, cred.user.uid);
                }
                
                alert("✅ تم التسجيل بنجاح! حسابك الآن قيد الانتظار ولن تتمكن من الدخول حتى يوافق الأدمن.");
                
                await signOut(auth);
                window.location.href = "seller-login.html";
                
            } catch (e) {
                console.error("Registration Error:", e);
                let msg = e.message;
                if (msg.includes("email-already-in-use")) msg = "البريد الإلكتروني مستخدم بالفعل.";
                if (msg.includes("weak-password")) msg = "كلمة المرور ضعيفة (يجب أن تكون 6 أحرف على الأقل).";
                
                alert("خطأ: " + msg);
                
                authBtn.innerText = originalText;
                authBtn.disabled = false;
            }
        });
    }
}

// ============================================================
// 6. منطق الصيدلي (PHARMACIST) - لوحة التحكم (DASHBOARD)
// ============================================================
if (document.getElementById('ordersList')) {
    
    let currentPharmaId = null;
    let myRespondedRequests = new Set(); // لتخزين معرفات الطلبات التي رددت عليها
    let latestRequestsSnapshot = null; // لتخزين نسخة من الطلبات لإعادة رسمها عند الحاجة

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            if (user.email === "david_hassan5@hotmail.com") {
                alert("حساب الأدمن لا يمكنه الوصول لهذه الصفحة.");
                window.location.href = "admin.html";
                return;
            }

            currentPharmaId = user.uid;
            
            // التحقق الأمني
            const docSnap = await getDocFromServer(doc(db, "pharmacists", user.uid));
            if (!docSnap.exists() || !docSnap.data().isVerified || docSnap.data().isBlocked) {
                 alert("وصول غير مصرح به. يرجى التحقق من حالة حسابك.");
                 await signOut(auth);
                 window.location.href = "seller-login.html";
                 return;
            }
            
            currentUserProfile = docSnap.data();
            await initPharmaDashboard(user.uid);
        } else {
            window.location.href = "seller-login.html";
        }
    });

    function generateStars(rating) {
    const r = parseFloat(rating) || 0;
    let html = '';
    for (let i = 1; i <= 5; i++) {
        // رسم النجوم (صفراء للممتلئة ورمادية للفارغة)
        html += i <= r ? '<span class="text-yellow-400 text-lg">★</span>' : '<span class="text-gray-300 text-lg">★</span>';
    }
    return html;
}

// 2. دالة لوحة التحكم المعدلة (نفس منطقك مع إصلاح العرض)
async function initPharmaDashboard(uid) {
    if ("Notification" in window) Notification.requestPermission();
    createOfferModal();
    
    // استماع مباشر لتحديثات ملف الصيدلي
    onSnapshot(doc(db, "pharmacists", uid), (docSnap) => {
        if (docSnap.exists()) {
            currentUserProfile = docSnap.data();
            
            // تحديث الاسم
            if (document.getElementById('headerShopName'))
                document.getElementById('headerShopName').innerText = currentUserProfile.shopName;
            
            // --- هنا التصحيح: تحديث النجوم + الرقم ---
            if (document.getElementById('pharmaStarsDisplay')) {
                const r = currentUserProfile.rating || 0; // المعدل
                const c = currentUserProfile.reviewCount || 0; // عدد المقيمين
                
                // نضع النجوم وبجانبها الرقم بين قوسين
                document.getElementById('pharmaStarsDisplay').innerHTML = `
                        <div class="flex items-center">
                            <div class="flex text-lg">${generateStars(r)}</div>
                            <span class="text-xs font-bold text-slate-600 mr-2 pt-1">(${r})</span>
                        </div>`;
            }
            
            // تحديث حالة الموقع
            if (document.getElementById('pharmaLocationDisplay'))
                document.getElementById('pharmaLocationDisplay').innerText = currentUserProfile.location ? "موقعك نشط" : "غير محدد";
            
            // تحديث الهاتف
            if (document.getElementById('editPhone'))
                document.getElementById('editPhone').value = currentUserProfile.phone;
        }
    });
    
    // تشغيل بقية المستمعين
    startPharmaListeners(uid);
}

    function startPharmaListeners(uid) {
        // 1. الاستماع لعروضي (Responses) أولاً لملء القائمة المحظورة
        onSnapshot(query(collection(db, "responses"), where("pharmacyId", "==", uid)), async (snap) => {
            const list = document.getElementById('myOffersList');
            const countEl = document.getElementById('totalSalesCount'); 
            
            // تحديث قائمة "طلبات قمت بالرد عليها"
            myRespondedRequests.clear();
            snap.forEach(d => myRespondedRequests.add(d.data().requestId));

            // تحديث العداد
            if(countEl) countEl.innerText = snap.size;

            // إعادة رسم قائمة الطلبات الرئيسية (لإخفاء ما تم الرد عليه)
            if(latestRequestsSnapshot) {
                renderRequestsList(latestRequestsSnapshot);
            }

            if(!list) return;
            list.innerHTML = "";
            
            // عرض قائمة "عروضي"
            if(snap.empty) {
                list.innerHTML = `<p class="text-center text-gray-400 text-xs py-4">لم تقدم أي عروض بعد</p>`;
            }

            for (const docSnap of snap.docs) {
                const offer = docSnap.data();
                const offerId = docSnap.id;
                let reqInfo = { medicineName: "غير معروف", phoneNumber: "---" };
                let reqStatus = "";

                try {
                    const req = await getDoc(doc(db, "requests", offer.requestId));
                    if(req.exists()) {
                        reqInfo = req.data();
                        reqStatus = reqInfo.status;
                    }
                } catch(e){}

                const isWinner = offer.isWinner || (reqStatus === 'accepted' && reqInfo.winnerOfferId === offerId);
                const statusBadge = isWinner ? 
                    `<span class="bg-green-100 text-green-700 text-[9px] px-2 py-1 rounded-full font-bold"> تم القبول </span>` : 
                    `<span class="bg-gray-100 text-gray-500 text-[9px] px-2 py-1 rounded-full">⏳ في انتظار المريض</span>`;

                list.innerHTML += `
                <div class="bg-white p-4 rounded-xl border ${isWinner ? 'border-green-300 ring-1 ring-green-100' : 'border-gray-100'} shadow-sm mb-2 animate-slide-up">
                    <div class="flex justify-between items-center mb-2">
                        <h4 class="font-bold text-slate-800 text-sm">${reqInfo.medicineName}</h4>
                        <span class="text-xs font-bold text-green-700 bg-green-50 px-2 py-1 rounded">${offer.price} دج</span>
                    </div>
                    <div class="flex justify-between items-center mb-2">
                         ${statusBadge}
                    </div>
                    <div class="flex gap-2 text-[10px] text-gray-500 mb-2">
                        <span class="bg-slate-50 px-2 py-1 rounded">📞 المريض: ${reqInfo.phoneNumber}</span>
                        <span>${timeAgo(offer.createdAt)}</span>
                    </div>
                    ${!isWinner ? `<button onclick="window.deleteResponse('${offerId}')" class="w-full text-red-400 text-xs py-1 hover:bg-red-50 rounded transition border border-red-50">حذف العرض</button>` : ''}
                </div>`;
            }
        });

        // 2. الاستماع للطلبات الجديدة (Requests)
        const qReq = query(collection(db, "requests"), where("status", "==", "pending"));
        onSnapshot(qReq, (snap) => {
            latestRequestsSnapshot = snap; // حفظ النسخة
            renderRequestsList(snap);      // استدعاء دالة الرسم
        });
    }

    // دالة منفصلة لرسم الطلبات مع الفلترة
    function renderRequestsList(snap) {
        const list = document.getElementById('ordersList');
        if(!list) return;
        list.innerHTML = "";

        if(!isFirstLoad) {
            snap.docChanges().forEach((change) => {
                if(change.type === 'added') {
                    const d = change.doc.data();
                    if((new Date() - d.createdAt.toDate()) < 60000 && !myRespondedRequests.has(change.doc.id)) {
                        new Notification("طلب دواء جديد", { body: d.medicineName });
                    }
                }
            });
        }
        isFirstLoad = false;

        let visibleCount = 0;

        snap.forEach(d => {
            const reqId = d.id;
            
            // --- الفلتر السحري: إذا كنت قد رددت على هذا الطلب، لا تعرضه ---
            if (myRespondedRequests.has(reqId)) return;

            visibleCount++;
            const r = d.data();
            
            list.innerHTML += `
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-3 flex flex-row h-auto min-h-[140px] hover:shadow-md transition animate-slide-up">
                
                <div class="w-1/3 bg-slate-50 relative border-l border-gray-100 group cursor-pointer flex items-center justify-center overflow-hidden">
                    ${r.prescriptionUrl ? 
                        `<img src="${r.prescriptionUrl}" onclick="openLightbox('${r.prescriptionUrl}')" class="w-full h-full object-cover transition hover:scale-110">
                         <div class="absolute inset-0 bg-black/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition pointer-events-none">
                            <span class="bg-white/80 text-[10px] font-bold px-2 py-1 rounded">تكبير</span>
                         </div>` 
                        : `<div class="text-gray-300 text-center"><span class="text-2xl block">💊</span><span class="text-[9px] font-bold">بلا وصفة</span></div>`
                    }
                </div>

                <div class="w-2/3 p-3 flex flex-col justify-between">
                    <div>
                        <div class="flex justify-between items-start mb-1">
                            <h3 class="font-bold text-slate-800 text-base leading-tight line-clamp-2">${r.medicineName}</h3>
                            <span class="text-[9px] text-gray-400 whitespace-nowrap mr-1">${timeAgo(r.createdAt)}</span>
                        </div>
                        
                        <div class="flex flex-wrap gap-1 mb-2">
                            <span class="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">📍 ${r.wilaya}</span>
                            <span class="text-[10px] font-bold text-slate-600 bg-slate-50 px-2 py-0.5 rounded font-mono">📞 ${r.phoneNumber}</span>
                        </div>
                        
                        ${r.notes ? `<p class="text-[10px] text-gray-500 bg-orange-50 p-1.5 rounded line-clamp-2">📝 ${r.notes}</p>` : ''}
                    </div>

                    <button onclick="window.openOfferWindow('${reqId}')" class="w-full mt-2 bg-slate-800 text-white font-bold py-2.5 rounded-xl hover:bg-slate-900 transition text-xs shadow-md active:scale-95 flex items-center justify-center gap-1">
                        <span>💰 تقديم عرض</span>
                    </button>
                </div>
            </div>`;
        });

        if(visibleCount === 0) {
            list.innerHTML = `<div class="text-center py-10 text-gray-400">لا توجد طلبات جديدة متاحة لك حالياً</div>`;
        }
    }

    // --- نافذة تقديم العرض (Modal) ---
    // تم إصلاح الشفافية بإزالة كلاسات opacity-0 عند الفتح يدوياً
    window.openOfferWindow = async (reqId) => {
        if (!currentUserProfile || !currentUserProfile.isVerified || currentUserProfile.isBlocked) {
            alert("لا يمكنك تقديم عروض.");
            return;
        }

        // فحص إضافي: هل قدمت عرضاً بالفعل؟
        if(myRespondedRequests.has(reqId)) {
            alert("لقد قدمت عرضاً لهذا الطلب مسبقاً.");
            return;
        }

        currentOfferReqId = reqId;
        const modal = document.getElementById('offerModal');
        
        if(modal) {
            // تفريغ الحقول
            document.getElementById('modalPrice').value = "";
            document.getElementById('modalNote').value = "";
            
            // إظهار النافذة وإلغاء الشفافية
            modal.classList.remove('hidden');
            // تأخير بسيط لتفعيل الترانزيشن
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                modal.classList.add('opacity-100');
                const content = modal.querySelector('div'); // الحاوية البيضاء
                if(content) {
                    content.classList.remove('scale-95');
                    content.classList.add('scale-100');
                }
            }, 10);
        } else {
            console.error("Offer Modal not found!");
            createOfferModal(); // محاولة إعادة الإنشاء
        }
    };

    // إغلاق النافذة
    window.closeOfferModal = () => {
        const modal = document.getElementById('offerModal');
        if(modal) {
            modal.classList.remove('opacity-100');
            modal.classList.add('opacity-0');
            const content = modal.querySelector('div');
            if(content) {
                content.classList.remove('scale-100');
                content.classList.add('scale-95');
            }
            setTimeout(() => modal.classList.add('hidden'), 300);
        }
    }

    // إرسال العرض
    window.submitOffer = async () => {
        const price = document.getElementById('modalPrice').value;
        const note = document.getElementById('modalNote').value;

        if(!price) return alert("يرجى كتابة السعر");

        // إغلاق النافذة فوراً
        window.closeOfferModal();

        try {
            // التحقق النهائي من التكرار
            const checkQuery = query(collection(db, "responses"), where("requestId", "==", currentOfferReqId), where("pharmacyId", "==", currentPharmaId));
            const checkSnap = await getDocs(checkQuery);
            if(!checkSnap.empty) {
                alert("لقد قدمت عرضاً بالفعل.");
                return;
            }

            await addDoc(collection(db, "responses"), {
                requestId: currentOfferReqId,
                pharmacyId: currentPharmaId,
                pharmacyName: currentUserProfile.shopName,
                pharmacyPhone: currentUserProfile.phone,
                location: currentUserProfile.location,
                gpsLink: currentUserProfile.gpsLink,
                pharmaRating: currentUserProfile.rating,
                price: price,
                notes: note,
                isWinner: false,
                createdAt: serverTimestamp()
            });
            
            await logAction('submit_offer', `Offer sent for request ${currentOfferReqId}, Price: ${price}`, currentPharmaId);
            
            // ملاحظة: سيقوم onSnapshot تلقائياً بتحديث القوائم (نقل الطلب من "طلبات" إلى "عروضي")

        } catch(e) { 
            console.error(e);
            alert("خطأ: " + e.message); 
        }
    };
    
    window.deleteResponse = async (id) => {
        if(confirm("حذف العرض؟ سيعود الطلب للظهور في القائمة الرئيسية.")) {
            await deleteDoc(doc(db, "responses", id));
        }
    }

    window.logout = () => { 
        if(confirm("خروج؟")) {
            signOut(auth).then(() => window.location.href="seller-login.html");
        }
    };

    window.updatePharmaLocation = () => {
        if(!navigator.geolocation) return alert("GPS Error");
        navigator.geolocation.getCurrentPosition(async (pos)=>{
            const loc = {lat: pos.coords.latitude, lng: pos.coords.longitude};
            const link = `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
            await updateDoc(doc(db, "pharmacists", currentPharmaId), { location: loc, gpsLink: link });
            alert("تم تحديث الموقع");
        });
    };
    
    window.changePharmaPassword = async () => {
        const p1 = document.getElementById('newPass').value;
        const p2 = document.getElementById('confirmPass').value;
        if(p1.length<6 || p1!==p2) return alert("خطأ في تطابق كلمة المرور");
        try { await updatePassword(auth.currentUser, p1); alert("تم تغيير كلمة المرور"); } catch(e){ alert("يجب إعادة تسجيل الدخول لتغيير كلمة المرور"); }
    };
    
    window.updatePharmaPhone = async () => {
        const ph = document.getElementById('editPhone').value;
        if(ph) { await updateDoc(doc(db, "pharmacists", currentPharmaId), { phone: ph }); alert("تم تحديث الهاتف"); }
    };
}

// ============================================================
// 7. منطق الأدمن (ADMIN)
// ============================================================
if (document.getElementById('adminDashboard') || document.getElementById('adminLoginScreen')) {
    const adminEmailReal = "david_hassan5@hotmail.com";
    
    onAuthStateChanged(auth, (user) => {
        if(user && user.email === adminEmailReal) {
            safeToggle('adminLoginScreen', 'hide'); safeToggle('adminDashboard', 'show');
            document.getElementById('adminDashboard').style.display = 'flex';
            startAdminLogic();
        } else {
            safeToggle('adminLoginScreen', 'show'); safeToggle('adminDashboard', 'hide');
            document.getElementById('adminDashboard').style.display = 'none';
        }
    });

    const abtn = document.getElementById('btnAdminLogin');
    if(abtn) abtn.addEventListener('click', async () => {
        try { await signInWithEmailAndPassword(auth, document.getElementById('adminEmail').value, document.getElementById('adminPass').value); }
        catch(e) { alert("خطأ في بيانات الأدمن"); }
    });

    function startAdminLogic() {
        onSnapshot(query(collection(db, "pharmacists"), where("isVerified", "==", false)), (s) => renderAdminList('adminPendingList', s.docs, 'pending'));
        onSnapshot(query(collection(db, "pharmacists"), where("isVerified", "==", true)), (s) => renderAdminList('adminSellersList', s.docs, 'active'));
        onSnapshot(collection(db, "requests"), (s) => renderAdminList('adminOrdersList', s.docs, 'orders'));
    }
    
    function renderAdminList(elId, docs, type) {
        const list = document.getElementById(elId);
        if(!list) return;
        list.innerHTML = "";
        docs.forEach(d => {
            const data = d.data();
            const id = d.id;
            const gpsButton = data.gpsLink ? `<a href="${data.gpsLink}" target="_blank" class="text-blue-500 text-xs underline">موقع</a>` : '';
            
            list.innerHTML += `<div class="bg-white p-3 mb-2 rounded border shadow-sm flex justify-between items-center">
                <div>
                    <b>${data.shopName || data.medicineName}</b>
                    <br><span class="text-xs text-gray-500">${data.phone || data.phoneNumber || ''}</span>
                    <span class="text-[10px] text-gray-400 block">${data.status || (data.isBlocked ? 'محظور' : 'نشط')}</span>
                    ${gpsButton}
                </div>
                <div>
                    ${type==='pending' ? `<button onclick="window.adminAction('verify','${id}')" class="text-green-600 text-xs border p-1 rounded">قبول</button>` : ''}
                    <button onclick="window.adminAction('${type==='orders'?'deleteReq':'deletePharma'}','${id}')" class="text-red-500 text-xs border p-1 rounded">حذف</button>
                    ${type==='active' ? `<button onclick="window.adminAction('block','${id}',${data.isBlocked})" class="text-blue-500 text-xs border p-1 rounded">${data.isBlocked?'فك':'حظر'}</button>` : ''}
                </div>
            </div>`;
        });
    }

    window.adminAction = async (act, id, status) => {
        if(act === 'verify') {
            await updateDoc(doc(db, "pharmacists", id), {isVerified: true});
            await logAction('admin_verify', `Pharmacist ${id} verified`);
        }
        if(act === 'deletePharma') if(confirm("حذف نهائي للصيدلي؟")) {
            await deleteDoc(doc(db, "pharmacists", id));
            await logAction('admin_delete_pharma', `Pharmacist ${id} deleted`);
        }
        if(act === 'block') {
            await updateDoc(doc(db, "pharmacists", id), {isBlocked: !status});
            await logAction('admin_block', `Pharmacist ${id} blocked status: ${!status}`);
        }
        if(act === 'deleteReq') {
            await deleteDoc(doc(db, "requests", id));
            await logAction('admin_delete_req', `Request ${id} deleted`);
        }
    };
    
    const btnLogout = document.getElementById('btnLogout');
    if(btnLogout) {
        btnLogout.addEventListener('click', ()=> signOut(auth));
    }
}