// ============================================================
// 1) PASTE YOUR TWO VALUES FROM SUPABASE (Settings -> API)
//    Use the Project URL and the "anon public" key ONLY.
//    NEVER paste the service_role key here.
// ============================================================
const SUPABASE_URL = "https://xbtnrmpqjdsoysslvmaw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhidG5ybXBxamRzb3lzc2x2bWF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0NzQ3NzIsImV4cCI6MjEwODA1MDc3Mn0.FBtdYECa0UV9iKGrLgKhEgUm8qA0_899NDTE-bM_iH0";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- Settings ----------
const INTERESTS = ["music", "football", "books", "cooking", "movies", "travel", "gaming", "art", "fitness", "studying"];
const LOOKING_FOR = ["just chatting", "friendship", "someone to talk to", "study partner"];
const RADIUS_OPTIONS = [1, 2, 5, 10, 15, 50]; // km (50 is the maximum)
const COLORS = ["Blue", "Green", "Golden", "Silver", "Quiet", "Brave", "Gentle", "Sunny", "Misty", "Cosy"];
const ANIMALS = ["Fox", "Owl", "Panda", "Otter", "Deer", "Koala", "Swan", "Rabbit", "Whale", "Robin"];

// ---------- State ----------
let user = null;
let profile = null;
let radius = 5;
let locationOn = localStorage.getItem("locationOn") !== "off";
let selectedInterests = [];
let newPhotoBlob = null;
let pendingEmail = "";

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);

function toast(message, isError = false) {
  const t = $("toast");
  t.textContent = message;
  t.className = "toast" + (isError ? " error" : "");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add("hidden"), 4000);
}

function showScreen(name) {
  ["auth", "profile", "nearby"].forEach((s) => $("screen-" + s).classList.add("hidden"));
  $("screen-" + name).classList.remove("hidden");
  $("nav").classList.toggle("hidden", name === "auth");
  $("nav-nearby").classList.toggle("active", name === "nearby");
  $("nav-profile").classList.toggle("active", name === "profile");
  window.scrollTo(0, 0);
}

function randomAlias() {
  const c = COLORS[Math.floor(Math.random() * COLORS.length)];
  const a = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return c + " " + a;
}

// Shrinks the photo to save storage space
async function compressImage(file, maxSize = 512) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
}

// ---------- LOGIN (email OTP) ----------
$("btn-send-code").onclick = async () => {
  const email = $("email").value.trim();
  if (!email) return toast("Please enter your email.", true);
  if (!$("age-check").checked) return toast("Please confirm you are 18 or older.", true);

  $("btn-send-code").disabled = true;
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  $("btn-send-code").disabled = false;

  if (error) return toast(error.message, true);
  pendingEmail = email;
  $("auth-step-email").classList.add("hidden");
  $("auth-step-code").classList.remove("hidden");
  toast("Code sent. Check your email (and spam folder).");
};

$("btn-verify").onclick = async () => {
  const token = $("code").value.trim();
  if (!token) return toast("Please enter the code.", true);

  $("btn-verify").disabled = true;
  const { error } = await sb.auth.verifyOtp({ email: pendingEmail, token, type: "email" });
  $("btn-verify").disabled = false;

  if (error) return toast(error.message, true);
  // onAuthStateChange below continues the flow
};

$("btn-back").onclick = () => {
  $("auth-step-code").classList.add("hidden");
  $("auth-step-email").classList.remove("hidden");
  $("code").value = "";
};

// ---------- PROFILE ----------
function buildChips(containerId, items, selectedList, onToggle) {
  const box = $(containerId);
  box.innerHTML = "";
  items.forEach((item) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (selectedList.includes(item) ? " on" : "");
    b.textContent = item;
    b.onclick = () => onToggle(item, b);
    box.appendChild(b);
  });
}

function setupProfileForm() {
  const sel = $("looking");
  sel.innerHTML = "";
  LOOKING_FOR.forEach((o) => {
    const opt = document.createElement("option");
    opt.value = o;
    opt.textContent = o;
    sel.appendChild(opt);
  });

  selectedInterests = profile ? [...(profile.interests || [])] : [];
  buildChips("interest-list", INTERESTS, selectedInterests, (item, btn) => {
    const i = selectedInterests.indexOf(item);
    if (i >= 0) selectedInterests.splice(i, 1);
    else selectedInterests.push(item);
    btn.classList.toggle("on");
  });

  $("name").value = profile ? profile.display_name : "";
  $("bio").value = profile && profile.bio ? profile.bio : "";
  $("bio-count").textContent = $("bio").value.length + "/150";
  if (profile && profile.looking_for) sel.value = profile.looking_for;
  $("incognito").checked = profile ? profile.incognito : false;
  newPhotoBlob = null;

  const hasPhoto = profile && profile.avatar_url;
  $("avatar-preview").classList.toggle("hidden", !hasPhoto);
  $("avatar-placeholder").classList.toggle("hidden", !!hasPhoto);
  if (hasPhoto) $("avatar-preview").src = profile.avatar_url;

  $("profile-title").textContent = profile ? "My Profile" : "Create your profile";
  $("btn-cancel-profile").classList.toggle("hidden", !profile);
}

$("bio").oninput = () => ($("bio-count").textContent = $("bio").value.length + "/150");

$("photo").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    newPhotoBlob = await compressImage(file);
    $("avatar-preview").src = URL.createObjectURL(newPhotoBlob);
    $("avatar-preview").classList.remove("hidden");
    $("avatar-placeholder").classList.add("hidden");
  } catch (err) {
    toast("Could not read that photo. Try a different one.", true);
  }
};

$("btn-save").onclick = async () => {
  const name = $("name").value.trim();
  if (!name) return toast("Please enter a display name.", true);

  $("btn-save").disabled = true;
  try {
    let avatar_url = profile ? profile.avatar_url : null;

    if (newPhotoBlob) {
      const path = user.id + "/avatar.jpg";
      const { error: upErr } = await sb.storage.from("avatars").upload(path, newPhotoBlob, {
        upsert: true,
        contentType: "image/jpeg",
      });
      if (upErr) throw upErr;
      const { data } = sb.storage.from("avatars").getPublicUrl(path);
      avatar_url = data.publicUrl + "?v=" + Date.now();
    }

    const incognito = $("incognito").checked;
    let alias = profile ? profile.alias : null;
    if (incognito && !alias) alias = randomAlias();

    const row = {
      id: user.id,
      display_name: name,
      bio: $("bio").value.trim(),
      avatar_url,
      interests: selectedInterests,
      looking_for: $("looking").value,
      incognito,
      alias,
    };

    const { error } = await sb.from("profiles").upsert(row);
    if (error) throw error;

    profile = { ...(profile || {}), ...row };
    toast("Profile saved.");
    openNearby();
  } catch (err) {
    toast(err.message || "Something went wrong.", true);
  }
  $("btn-save").disabled = false;
};

$("btn-cancel-profile").onclick = () => openNearby();

// ---------- LOCATION AND NEARBY ----------
function updateLocationButton() {
  const b = $("btn-loc-toggle");
  b.textContent = locationOn ? "Location: On" : "Location: Off";
  b.classList.toggle("off", !locationOn);
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Your browser does not support location."));
    navigator.geolocation.getCurrentPosition(resolve, (err) => {
      if (err.code === 1) reject(new Error("Location permission was denied. Allow it in your browser settings."));
      else reject(new Error("Could not get your location. Please try again."));
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 });
  });
}

$("btn-loc-toggle").onclick = async () => {
  if (locationOn) {
    locationOn = false;
    localStorage.setItem("locationOn", "off");
    await sb.rpc("clear_my_location");
    toast("Location is off. You are hidden from others.");
  } else {
    locationOn = true;
    localStorage.setItem("locationOn", "on");
  }
  updateLocationButton();
  loadNearby();
};

function buildRadiusChips() {
  const box = $("radius-list");
  box.innerHTML = "";
  RADIUS_OPTIONS.forEach((km) => {
    const b = document.createElement("button");
    b.className = "chip" + (km === radius ? " on" : "");
    b.textContent = km + " km";
    b.onclick = () => {
      radius = km;
      buildRadiusChips();
      loadNearby();
    };
    box.appendChild(b);
  });
}

async function loadNearby() {
  const list = $("nearby-list");
  const status = $("nearby-status");
  list.innerHTML = "";

  if (!locationOn) {
    status.textContent = "Location is off. Turn it on to see people near you.";
    return;
  }

  status.textContent = "Finding people near you…";
  try {
    const pos = await getPosition();
    const { error: locErr } = await sb.rpc("set_my_location", {
      p_lat: pos.coords.latitude,
      p_lng: pos.coords.longitude,
    });
    if (locErr) throw locErr;

    const { data, error } = await sb.rpc("nearby_users", { radius_km: radius });
    if (error) throw error;

    if (!data || data.length === 0) {
      status.textContent = "No one within " + radius + " km yet. Try a bigger distance, or check back soon.";
      return;
    }
    status.textContent = "";
    data.forEach((p) => list.appendChild(personCard(p)));
  } catch (err) {
    status.textContent = err.message || "Something went wrong.";
  }
}

function personCard(p) {
  const card = document.createElement("div");
  card.className = "person";

  let pic;
  if (p.avatar_url) {
    pic = document.createElement("img");
    pic.src = p.avatar_url;
    pic.alt = "";
  } else {
    pic = document.createElement("div");
    pic.textContent = (p.name || "?").charAt(0).toUpperCase();
  }
  pic.className = "avatar" + (p.avatar_url ? "" : " placeholder");

  const info = document.createElement("div");
  info.className = "info";

  const nameRow = document.createElement("div");
  nameRow.className = "name";
  const nameSpan = document.createElement("span");
  nameSpan.textContent = p.name;
  if (p.is_incognito) {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = " incognito";
    nameSpan.appendChild(document.createTextNode(" "));
    nameSpan.appendChild(badge);
  }
  const dist = document.createElement("span");
  dist.className = "dist";
  dist.textContent = p.distance_label;
  nameRow.append(nameSpan, dist);
  info.appendChild(nameRow);

  if (p.bio) {
    const bio = document.createElement("div");
    bio.className = "bio";
    bio.textContent = p.bio;
    info.appendChild(bio);
  }
  if (p.interests && p.interests.length) {
    const tags = document.createElement("div");
    tags.className = "tags";
    tags.textContent = p.interests.map((t) => "#" + t).join("  ");
    info.appendChild(tags);
  }
  if (p.looking_for) {
    const l = document.createElement("div");
    l.className = "looking";
    l.textContent = "Looking for: " + p.looking_for;
    info.appendChild(l);
  }

  card.append(pic, info);
  return card;
}

function openNearby() {
  showScreen("nearby");
  updateLocationButton();
  buildRadiusChips();
  loadNearby();
}

function openProfile() {
  setupProfileForm();
  showScreen("profile");
}

// ---------- NAVIGATION ----------
$("nav-nearby").onclick = () => (profile ? openNearby() : toast("Please create your profile first."));
$("nav-profile").onclick = () => openProfile();
$("nav-logout").onclick = async () => {
  await sb.auth.signOut();
};

// ---------- START ----------
async function afterLogin(session) {
  user = session.user;
  const { data, error } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) return toast(error.message, true);
  profile = data;
  if (profile) openNearby();
  else openProfile();
}

sb.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" || !session) {
    user = null;
    profile = null;
    $("auth-step-code").classList.add("hidden");
    $("auth-step-email").classList.remove("hidden");
    $("code").value = "";
    showScreen("auth");
  } else if (event === "SIGNED_IN" && (!user || user.id !== session.user.id)) {
    // Delay so Supabase finishes setting the session before we query
    setTimeout(() => afterLogin(session), 0);
  }
});

(async () => {
  const { data } = await sb.auth.getSession();
  if (!data.session) showScreen("auth");
})();