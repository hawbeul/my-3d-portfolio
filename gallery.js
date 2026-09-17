import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInWithCustomToken, signInAnonymously, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, addDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const appId = typeof __app_id !== 'undefined' ? __app_id : 'demo-portfolio';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
    apiKey: "AIzaSyD5962YmOqUSgYDM01ek6w2bW6YaTQ5Gi8",
    authDomain: "dportfoilopage.firebaseapp.com",
    projectId: "dportfoilopage",
    storageBucket: "dportfoilopage.firebasestorage.app",
    messagingSenderId: "664988271909",
    appId: "1:664988271909:web:6fbc51b76750270c1046cc",
    measurementId: "G-W457S6FRLE"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// State variables
let isAdmin = false;
let globalProjects = {};
let currentOpenProjectId = null;
let unsubscribeProjects = null;
let unsubscribeProfile = null;

// UI Elements (DOMContentLoaded 이후에 안전하게 요소를 가져옴)
let mainView, projectView;

document.addEventListener('DOMContentLoaded', () => {
    mainView = document.getElementById('main-view');
    projectView = document.getElementById('project-view');
    init();
});

async function init() {
    try {
        if (typeof __initial_auth_token !== 'undefined') {
            await signInWithCustomToken(auth, __initial_auth_token);
        } else {
            await signInAnonymously(auth);
        }
    } catch (e) {
        console.error("Auth init failed:", e);
        window.showMessage("Authentication Error", "Could not connect securely.");
    }
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        await checkAdminStatus(user);
        startListeners();
    } else {
        isAdmin = false;
        updateAdminUI();
        stopListeners();
    }
});

async function checkAdminStatus(user) {
    try {
        const adminRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'admin');
        const adminSnap = await getDoc(adminRef);
        if (adminSnap.exists()) {
            isAdmin = (adminSnap.data().uid === user.uid);
        } else {
            isAdmin = false;
        }
        updateAdminUI();
    } catch (e) {
        console.error("Admin check failed", e);
    }
}

window.handleAdminLogin = async () => {
    const provider = new GoogleAuthProvider();
    let resultUser = auth.currentUser;
    
    try {
        const result = await signInWithPopup(auth, provider);
        resultUser = result.user;
    } catch (popupErr) {
        console.warn("Popup blocked or cancelled. Using current session to simulate Admin.", popupErr);
    }

    if(!resultUser) return;

    try {
        const adminRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'admin');
        const adminSnap = await getDoc(adminRef);
        
        if (!adminSnap.exists()) {
            await setDoc(adminRef, { uid: resultUser.uid });
            isAdmin = true;
            window.showMessage("Welcome", "You are now the Admin of this portfolio!");
        } else {
            isAdmin = (adminSnap.data().uid === resultUser.uid);
            if (!isAdmin) {
                window.showMessage("Access Denied", "You are not authorized as the admin.");
            } else {
                window.showMessage("Welcome Back", "Admin mode activated.");
            }
        }
        updateAdminUI();
    } catch (e) {
        console.error("Admin verification failed:", e);
        window.showMessage("Error", "Could not verify admin status.");
    }
};

window.handleAdminLogout = async () => {
    await signOut(auth);
    window.showMessage("Logged Out", "You have exited admin mode.");
    init();
};

function updateAdminUI() {
    document.getElementById('admin-login-btn').classList.toggle('hidden', isAdmin);
    document.getElementById('admin-logout-btn').classList.toggle('hidden', !isAdmin);
    document.getElementById('admin-profile-edit').classList.toggle('hidden', !isAdmin);
    document.getElementById('admin-add-project').classList.toggle('hidden', !isAdmin);
    
    const pvEditBtn = document.getElementById('pv-admin-edit');
    if(pvEditBtn) pvEditBtn.classList.toggle('hidden', !isAdmin);
    
    renderProjectsUI();
}

function startListeners() {
    const profileRef = doc(db, 'artifacts', appId, 'public', 'data', 'profile', 'main');
    unsubscribeProfile = onSnapshot(profileRef, (snap) => {
        if(snap.exists()) {
            const data = snap.data();
            if(data.photoUrl) document.getElementById('profilePreview').src = data.photoUrl;
        }
    }, (error) => console.error("Profile listen error:", error));

    const projectsCol = collection(db, 'artifacts', appId, 'public', 'data', 'portfolio');
    unsubscribeProjects = onSnapshot(projectsCol, (snapshot) => {
        if (snapshot.empty && isAdmin && Object.keys(globalProjects).length === 0) {
            seedInitialData();
        } else {
            const projectsArray = [];
            snapshot.forEach(doc => {
                projectsArray.push({ id: doc.id, ...doc.data() });
            });
            
            projectsArray.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            
            globalProjects = {};
            projectsArray.forEach(p => globalProjects[p.id] = p);
            renderProjectsUI();
            
            if (currentOpenProjectId && globalProjects[currentOpenProjectId]) {
                populateProjectView(currentOpenProjectId);
            } else if (currentOpenProjectId && !globalProjects[currentOpenProjectId]) {
                window.closeProject();
            }
        }
    }, (error) => console.error("Projects listen error:", error));
}

function stopListeners() {
    if (unsubscribeProfile) unsubscribeProfile();
    if (unsubscribeProjects) unsubscribeProjects();
    globalProjects = {};
    renderProjectsUI();
}

async function seedInitialData() {
    const initialProjects = [
        {
            category: 'Likeness Sculpting',
            title: 'Loki (Tom Hiddleston) 3D Sculpt',
            description: 'A high-fidelity 3D likeness sculpt of Tom Hiddleston as Loki. Focused on anatomical accuracy, intricate micro-details of the skin pores, and stylized hair grooming to achieve a production-ready cinematic asset. Sculpted entirely in ZBrush and rendered with temporary polypaint.',
            mainImg: 'https://placehold.co/1200x800/0d1117/06b6d4?text=Loki+Final+Render',
            createdAt: Date.now(),
            gallery: [
                { url: 'https://placehold.co/800x600/161b22/22d3ee?text=ZBrush+High+Poly', caption: 'High Poly ZBrush Sculpt (Clay Render)' },
                { url: 'https://placehold.co/800x600/161b22/22d3ee?text=Wireframe+Topology', caption: 'Retopology & Facial Wireframe' },
                { url: 'https://placehold.co/800x600/161b22/22d3ee?text=Skin+Micro-Details', caption: 'Pore & Wrinkle Micro-Details' }
            ]
        },
        {
            category: 'Animation Character Design',
            title: 'Goryeo 1020s Animation Characters',
            description: 'Historical fantasy character models featuring "Cha Do-yeon" and "Geum Cheon-ho" set in the 1020s Goryeo era. The design emphasizes authentic traditional garments adapted for modern 3D animation, balancing hard-surface armor modeling with dynamic cloth simulation-ready topology.',
            mainImg: 'https://placehold.co/1200x800/0d1117/06b6d4?text=Cha+Do-yeon+%26+Geum+Cheon-ho',
            createdAt: Date.now() - 1000,
            gallery: [
                { url: 'https://placehold.co/800x600/161b22/22d3ee?text=Cha+Do-yeon+Full+Body', caption: 'Cha Do-yeon - Full Body Render' },
                { url: 'https://placehold.co/800x600/161b22/22d3ee?text=Geum+Cheon-ho+Armor', caption: 'Geum Cheon-ho - Hard Surface Armor Details' },
                { url: 'https://placehold.co/800x600/161b22/22d3ee?text=Garment+Topology', caption: 'Cloth Simulation Topology' }
            ]
        }
    ];

    const projectsCol = collection(db, 'artifacts', appId, 'public', 'data', 'portfolio');
    for(let p of initialProjects) {
        await addDoc(projectsCol, p);
    }
}

function renderProjectsUI() {
    const container = document.getElementById('portfolio-grid');
    if (!container) return;
    
    container.innerHTML = '';
    const projectsArray = Object.values(globalProjects);
    
    if (projectsArray.length === 0) {
        container.innerHTML = `<div class="col-span-1 md:col-span-2 text-center py-10 text-gray-500">No projects found.</div>`;
        return;
    }

    projectsArray.forEach(data => {
        const adminControls = isAdmin ? `
            <div class="absolute top-4 right-4 z-30 flex space-x-2">
                <button onclick="event.stopPropagation(); window.openEditProject('${data.id}')" class="bg-dark-900/90 text-white p-2.5 rounded-md hover:text-accent-400 hover:bg-dark-800 border border-white/10 shadow-lg transition-all" title="Edit">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                </button>
                <button onclick="event.stopPropagation(); window.deleteProject('${data.id}')" class="bg-dark-900/90 text-red-400 p-2.5 rounded-md hover:text-red-300 hover:bg-dark-800 border border-white/10 shadow-lg transition-all" title="Delete">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </div>
        ` : '';

        const itemHtml = `
            <div onclick="window.openProject('${data.id}')" class="group relative bg-dark-800 rounded-xl overflow-hidden border border-white/5 transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_20px_50px_rgba(6,182,212,0.2)] hover:border-accent-500/50 cursor-pointer">
                ${adminControls}
                <div class="aspect-video w-full bg-dark-900 overflow-hidden relative">
                    <div class="absolute inset-0 bg-gradient-to-t from-dark-900 via-dark-900/40 to-transparent z-10 opacity-90 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <img src="${data.mainImg || 'https://placehold.co/800x600/0d1117/06b6d4?text=No+Image'}" alt="${data.title}" class="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-in-out">
                    
                    <div class="absolute inset-0 z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <span class="bg-dark-900/80 text-white px-6 py-3 rounded-full backdrop-blur-sm border border-white/10 font-medium flex items-center">
                            View Project Details
                            <svg class="ml-2 w-4 h-4 text-accent-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                        </span>
                    </div>
                </div>
                <div class="absolute bottom-0 left-0 w-full p-8 z-20 translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                    <span class="text-accent-400 text-xs font-bold uppercase tracking-widest mb-2 block">${data.category || 'Portfolio Piece'}</span>
                    <h3 class="text-2xl font-bold text-white mb-2">${data.title}</h3>
                    <p class="text-gray-400 text-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-100 line-clamp-2">${data.description || ''}</p>
                </div>
            </div>
        `;
        container.innerHTML += itemHtml;
    });
}

window.navigateSection = function(e, targetId) {
    e.preventDefault();
    if (projectView.classList.contains('view-active')) {
        window.closeProject(() => {
            document.getElementById(targetId).scrollIntoView();
        });
    } else {
        document.getElementById(targetId).scrollIntoView();
    }
};

window.navigateHome = function(e) {
    e.preventDefault();
    if (projectView.classList.contains('view-active')) {
        window.closeProject(() => window.scrollTo(0, 0));
    } else {
        window.scrollTo(0, 0);
    }
};

function populateProjectView(projectId) {
    const data = globalProjects[projectId];
    if (!data) return;

    document.getElementById('pv-category').textContent = data.category || 'Category';
    document.getElementById('pv-title').textContent = data.title || 'Untitled';
    document.getElementById('pv-desc').textContent = data.description || '';
    document.getElementById('pv-main-img').src = data.mainImg || '';

    const galleryContainer = document.getElementById('pv-gallery');
    galleryContainer.innerHTML = ''; 
    if (data.gallery && Array.isArray(data.gallery)) {
        data.gallery.forEach(img => {
            if(!img.url) return;
            galleryContainer.innerHTML += `
                <div class="group rounded-xl overflow-hidden bg-dark-800 border border-white/5 relative">
                    <img src="${img.url}" alt="${img.caption}" class="w-full h-auto aspect-video object-cover transition-transform duration-500 group-hover:scale-105">
                    <div class="absolute bottom-0 w-full p-4 bg-gradient-to-t from-dark-900 to-transparent">
                        <p class="text-white text-sm font-medium drop-shadow-md">${img.caption || ''}</p>
                    </div>
                </div>
            `;
        });
    }
}

window.openProject = function(projectId) {
    currentOpenProjectId = projectId;
    populateProjectView(projectId);

    mainView.classList.remove('view-active');
    mainView.classList.add('view-hidden');
    
    setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'instant' });
        projectView.classList.remove('view-hidden');
        projectView.classList.add('view-active');
    }, 400); 
};

window.closeProject = function(callback) {
    currentOpenProjectId = null;
    projectView.classList.remove('view-active');
    projectView.classList.add('view-hidden');
    
    setTimeout(() => {
        mainView.classList.remove('view-hidden');
        mainView.classList.add('view-active');
        
        if(callback && typeof callback === 'function') {
            callback();
        } else {
            document.getElementById('portfolio').scrollIntoView({ behavior: 'instant' });
        }
    }, 400);
};

window.openModal = function(modalId) {
    document.getElementById('modal-backdrop').classList.remove('hidden');
    document.getElementById('modal-backdrop').classList.add('flex');
    
    ['alert-modal', 'confirm-modal', 'profile-modal', 'project-modal'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
    
    document.getElementById(modalId).classList.remove('hidden');
    
    setTimeout(() => {
        document.getElementById('modal-backdrop').style.opacity = '1';
    }, 10);
};

window.closeModals = function() {
    document.getElementById('modal-backdrop').style.opacity = '0';
    setTimeout(() => {
        document.getElementById('modal-backdrop').classList.add('hidden');
        document.getElementById('modal-backdrop').classList.remove('flex');
    }, 300);
};

window.showMessage = function(title, message) {
    document.getElementById('alert-title').textContent = title;
    document.getElementById('alert-message').textContent = message;
    window.openModal('alert-modal');
};

window.showConfirm = function(message, onConfirm) {
    document.getElementById('confirm-message').textContent = message;
    document.getElementById('confirm-btn').onclick = () => {
        window.closeModals();
        onConfirm();
    };
    window.openModal('confirm-modal');
};

window.saveProfile = async function() {
    if (!auth.currentUser || !isAdmin) return;
    const url = document.getElementById('profile-url-input').value.trim();
    if(!url) return;

    try {
        const profileRef = doc(db, 'artifacts', appId, 'public', 'data', 'profile', 'main');
        await setDoc(profileRef, { photoUrl: url }, { merge: true });
        window.closeModals();
    } catch(e) {
        console.error("Save profile error", e);
        window.showMessage("Error", "Could not save profile picture.");
    }
};

window.editCurrentProject = function() {
    if(currentOpenProjectId) {
        window.openEditProject(currentOpenProjectId);
    }
};

window.openEditProject = function(projectId) {
    if (!isAdmin) return;
    
    const isEdit = !!projectId;
    document.getElementById('project-modal-title').textContent = isEdit ? "Edit Project" : "Add New Project";
    document.getElementById('project-id-input').value = projectId || "";
    document.getElementById('gallery-fields-container').innerHTML = '';
    
    if (isEdit && globalProjects[projectId]) {
        const p = globalProjects[projectId];
        document.getElementById('project-category-input').value = p.category || '';
        document.getElementById('project-title-input').value = p.title || '';
        document.getElementById('project-mainimg-input').value = p.mainImg || '';
        document.getElementById('project-desc-input').value = p.description || '';
        
        if (p.gallery && Array.isArray(p.gallery)) {
            p.gallery.forEach(g => window.addGalleryField(g.url, g.caption));
        }
    } else {
        document.getElementById('project-category-input').value = '';
        document.getElementById('project-title-input').value = '';
        document.getElementById('project-mainimg-input').value = '';
        document.getElementById('project-desc-input').value = '';
        window.addGalleryField(); 
    }
    
    window.openModal('project-modal');
};

window.addGalleryField = function(url = '', caption = '') {
    const container = document.getElementById('gallery-fields-container');
    const div = document.createElement('div');
    div.className = 'flex flex-col sm:flex-row gap-2 items-center bg-dark-900 p-2 rounded';
    div.innerHTML = `
        <input type="text" placeholder="Image URL" value="${url}" class="gallery-url w-full sm:w-1/2 bg-transparent border border-white/10 rounded p-2 text-white focus:border-accent-500 text-sm">
        <input type="text" placeholder="Caption" value="${caption}" class="gallery-cap w-full sm:w-1/2 bg-transparent border border-white/10 rounded p-2 text-white focus:border-accent-500 text-sm">
        <button type="button" onclick="this.parentElement.remove()" class="text-gray-500 hover:text-red-400 p-2 transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
        </button>
    `;
    container.appendChild(div);
};

window.saveProject = async function() {
    if (!auth.currentUser || !isAdmin) return;
    
    const id = document.getElementById('project-id-input').value;
    const category = document.getElementById('project-category-input').value.trim();
    const title = document.getElementById('project-title-input').value.trim();
    const mainImg = document.getElementById('project-mainimg-input').value.trim();
    const desc = document.getElementById('project-desc-input').value.trim();
    
    if(!title) {
        window.showMessage("Validation", "Project title is required.");
        return;
    }

    const gallery = [];
    const fields = document.getElementById('gallery-fields-container').children;
    for(let i=0; i<fields.length; i++) {
        const gUrl = fields[i].querySelector('.gallery-url').value.trim();
        const gCap = fields[i].querySelector('.gallery-cap').value.trim();
        if(gUrl) gallery.push({ url: gUrl, caption: gCap });
    }

    const projectData = {
        category, title, description: desc, mainImg, gallery,
        updatedAt: Date.now()
    };

    try {
        if (id) {
            const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'portfolio', id);
            await updateDoc(docRef, projectData);
        } else {
            projectData.createdAt = Date.now();
            const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'portfolio');
            await addDoc(colRef, projectData);
        }
        window.closeModals();
    } catch (e) {
        console.error("Save project error", e);
        window.showMessage("Error", "Could not save the project.");
    }
};

window.deleteProject = function(projectId) {
    if (!isAdmin) return;
    window.showConfirm("Are you sure you want to permanently delete this project?", async () => {
        try {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'portfolio', projectId));
            if(currentOpenProjectId === projectId) window.closeProject();
        } catch(e) {
            console.error("Delete error", e);
            window.showMessage("Error", "Could not delete the project.");
        }
    });
};