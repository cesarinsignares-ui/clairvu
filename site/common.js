// Outils partagés : connexion Supabase, réduction des photos, sélecteur de photos.
(function(){
  const C = window.APP_CONFIG;
  window.sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);

  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const fmtSize = b => b >= 1e6 ? (b/1e6).toFixed(1).replace(".",",")+" Mo" : Math.max(1,Math.round(b/1e3))+" Ko";
  const eur = n => (Number(n)||0).toLocaleString("fr-FR",{minimumFractionDigits:0,maximumFractionDigits:2})+" €";
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() :
    "10000000-1000-4000-8000-100000000000".replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16)));

  function toast(t){
    let el = $("#toast");
    if(!el){ el = document.createElement("div"); el.id="toast"; el.className="toast"; el.setAttribute("role","status"); document.body.appendChild(el); }
    el.textContent = t; el.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(()=>el.hidden=true, 3000);
  }

  // Réduit une photo (max 1600 px, JPEG) pour un envoi rapide.
  function shrink(file){
    return new Promise(res=>{
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = ()=>{
        const k = Math.min(1, 1600/Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth*k); c.height = Math.round(img.naturalHeight*k);
        c.getContext("2d").drawImage(img,0,0,c.width,c.height);
        URL.revokeObjectURL(url);
        c.toBlob(b => b ? res({blob:b, preview:URL.createObjectURL(b), label:file.name, before:file.size, after:b.size}) : res(null), "image/jpeg", 0.8);
      };
      img.onerror = ()=>{ URL.revokeObjectURL(url); res(null); };
      img.src = url;
    });
  }

  let pickerN = 0;
  function makePicker(root){
    const id = "pk"+(++pickerN); let photos = [];
    root.innerHTML = `<div class="ptop"><span>Photos</span><span class="pcount">0/5</span></div>
      <label class="drop" for="${id}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>
        <span class="big">Prendre ou ajouter des photos</span>
        <span class="hint">Jusqu'à 5 photos. Elles sont réduites automatiquement.</span>
        <input id="${id}" type="file" accept="image/*" multiple>
      </label>
      <div class="thumbs"></div>`;
    const inp = root.querySelector("input"), drop = root.querySelector(".drop");
    function draw(){
      root.querySelector(".pcount").textContent = photos.length+"/5";
      root.querySelector(".thumbs").innerHTML = photos.map((p,i)=>`<div class="th"><div class="img"><img src="${p.preview}" alt="Photo ${i+1}"><button type="button" class="x" data-i="${i}" aria-label="Retirer la photo">×</button></div><span class="sz">${fmtSize(p.before)} → ${fmtSize(p.after)}</span></div>`).join("");
      root.querySelectorAll(".x").forEach(b=>b.onclick=()=>{ URL.revokeObjectURL(photos[+b.dataset.i].preview); photos.splice(+b.dataset.i,1); draw(); });
      drop.hidden = photos.length >= 5;
    }
    async function add(files){
      const list = [...files].filter(f=>f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name));
      const room = 5 - photos.length;
      if(list.length > room) toast("5 photos maximum");
      for(const f of list.slice(0,room)){ const p = await shrink(f); if(p) photos.push(p); else toast("Photo illisible : "+f.name); }
      draw();
    }
    inp.addEventListener("change", ()=>{ add(inp.files); inp.value=""; });
    ["dragenter","dragover"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add("over");}));
    ["dragleave","drop"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove("over");}));
    drop.addEventListener("drop", e=>add(e.dataTransfer.files));
    draw();
    return { get:()=>photos.slice(), reset:()=>{ photos.forEach(p=>URL.revokeObjectURL(p.preview)); photos=[]; draw(); } };
  }

  // Envoie les photos dans le dossier de l'artisan, puis renvoie leurs chemins.
  async function uploadPhotos(artisanId, requestId, photos){
    const paths = [];
    for(let i=0;i<photos.length;i++){
      const path = `${artisanId}/${requestId}/${i+1}.jpg`;
      const { error } = await sb.storage.from("photos").upload(path, photos[i].blob, { contentType:"image/jpeg", upsert:false });
      if(error) throw new Error("Envoi de la photo "+(i+1)+" impossible : "+error.message);
      paths.push(path);
    }
    return paths;
  }

  // Lance l'analyse IA (en arrière-plan, ne bloque pas).
  function startAnalysis(requestId){
    return fetch("/.netlify/functions/summarize-background", {
      method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ id: requestId })
    }).catch(()=>{});
  }

  const TYPES = {
    "plombier":   ["Fuite","Débouchage","Chauffe-eau / ballon","Sanitaire (WC, lavabo, douche)","Installation","Autre"],
    "électricien":["Panne / disjoncteur","Prises et interrupteurs","Tableau électrique","Éclairage","Borne de recharge","Autre"],
    "chauffagiste":["Panne chaudière","Entretien","Radiateurs","Pompe à chaleur","Installation","Autre"],
    "couvreur":   ["Fuite toiture","Tuiles / ardoises","Gouttières","Zinguerie","Isolation","Autre"],
    "autre":      ["Dépannage","Réparation","Installation","Rénovation","Autre"]
  };
  const typesFor = t => TYPES[t] || TYPES.autre;

  Object.assign(window, { $, esc, eur, uuid, toast, makePicker, uploadPhotos, startAnalysis, typesFor, TRADES:Object.keys(TYPES) });
})();
