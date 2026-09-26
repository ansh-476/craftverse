(function () {
  const API = 'https://formly-c2wk.onrender.com';
  const isFormly = location.origin === API;

  // Formly page: keep the extension's auth token synchronized with the
  // currently signed-in Formly account. The extension never stores a copy
  // of the user's profile.
  if (isFormly) {
    // Relay the website's Open & Autofill request to the extension service worker.
    // The service worker then creates the target tab and activates that exact tab.
    window.addEventListener('message', e => {
      if (e.source !== window || e.origin !== location.origin) return;
      if (e.data?.source !== 'formly-web' || e.data?.type !== 'OPEN_FORM') return;
      chrome.runtime.sendMessage({
        type: 'OPEN_FORM',
        url: e.data.url,
      }).then(result => {
        window.postMessage({
          source: 'formly-extension',
          type: 'OPEN_FORM_RESULT',
          result
        }, location.origin);
      }).catch(error => {
        window.postMessage({
          source: 'formly-extension',
          type: 'OPEN_FORM_RESULT',
          result: { ok: false, error: error?.message || 'Extension is not available.' }
        }, location.origin);
      });
    });

    const syncAuth = () => {
      const token = localStorage.getItem('formly_token') || '';
      chrome.runtime.sendMessage({ type: 'FORMLY_AUTH', token }).catch(() => {});
    };
    syncAuth();
    window.addEventListener('storage', e => { if (e.key === 'formly_token') syncAuth(); });
    window.addEventListener('formly-auth-changed', syncAuth);
    return;
  }

  const aliases = {
    fullName: ['full name','candidate name','student name','your name','name'],
    firstName: ['first name','given name'],
    lastName: ['last name','surname','family name'],
    email: ['email address','email','e mail','email id'],
    mobile: ['mobile number','mobile','phone number','phone','contact number'],
    dob: ['date of birth','dob','birth date'],
    gender: ['gender','sex'],
    college: ['college / university name','college / institution','college','institution','university'],
    course: ['course / program','course / programme','course','program','programme','degree'],
    branch: ['branch / specialization','branch','department','specialization','specialisation'],
    year: ['academic year','study year','year'],
    prn: ['student / roll / prn number','prn','student id','student number','roll number','registration number'],
    tenth: ['10th percentage','10th','ssc percentage','ssc'],
    twelfth: ['12th percentage','12th','hsc percentage','hsc'],
    address: ['full address','current address','permanent address','address'],
    city: ['city','town'],
    state: ['state'],
    pincode: ['pin code','pincode','postal code','zip code','pin'],
    country: ['country'],
    fatherName: ['father / guardian name','father name','guardian name','parent name'],
    occupation: ['occupation','job','profession'],
    emergencyName: ['emergency contact name'],
    emergencyContact: ['emergency contact number','emergency phone','emergency mobile']
  };

  const normalize = s => String(s || '')
    .toLowerCase()
    .replace(/[\u00a0\n\r\t]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  function questionText(el) {
    // Google Forms puts the question and "Your answer" inside the role=listitem.
    const item = el.closest('[role="listitem"]');
    if (item) {
      const text = item.innerText || item.textContent || '';
      if (text.trim()) return text;
    }

    const parts = [];
    if (el.labels) parts.push([...el.labels].map(x => x.innerText || x.textContent || '').join(' '));
    const labelled = el.getAttribute('aria-labelledby');
    if (labelled) labelled.split(/\s+/).forEach(id => {
      const node = document.getElementById(id);
      if (node) parts.push(node.innerText || node.textContent || '');
    });
    const parent = el.parentElement?.parentElement;
    if (parent) parts.push(parent.innerText || parent.textContent || '');
    ['aria-label','name','placeholder','autocomplete'].forEach(a => parts.push(el.getAttribute(a) || ''));
    return parts.join(' ');
  }

  function getVisibleFields() {
    return [...document.querySelectorAll(
      'input, textarea, select, [role="textbox"], [role="combobox"], [role="radio"], [role="checkbox"], [role="option"], [contenteditable="true"]'
    )].filter(el => {
      if (el.disabled || el.readOnly || el.getAttribute('aria-disabled') === 'true') return false;
      if (el.tagName === 'INPUT' && ['hidden','submit','button','reset','file'].includes(el.type)) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  }

  // Formly 2.x profiles use dotted keys (for example
  // `personal.fullName`, `contact.email`, `education.current.college`).
  // Keep compatibility with the older flat keys too.
  const profilePaths = {
    fullName: ['fullName', 'personal.fullName'],
    firstName: ['firstName', 'personal.firstName'],
    lastName: ['lastName', 'personal.lastName'],
    email: ['email', 'contact.email'],
    mobile: ['mobile', 'contact.primaryMobile'],
    dob: ['dob', 'personal.dob'],
    gender: ['gender', 'personal.gender'],
    college: ['college', 'education.current.college', 'education.current.university'],
    course: ['course', 'education.current.degree'],
    branch: ['branch', 'education.current.branch', 'education.current.specialization'],
    year: ['year', 'education.current.year'],
    prn: ['prn', 'education.current.prn', 'education.current.studentId', 'education.current.rollNumber'],
    tenth: ['tenth', 'education.tenth.percentage'],
    twelfth: ['twelfth', 'education.twelfth.percentage'],
    address: ['address', 'addresses.current.address1', 'emergency.address'],
    city: ['city', 'addresses.current.city'],
    state: ['state', 'addresses.current.state'],
    pincode: ['pincode', 'addresses.current.pincode'],
    country: ['country', 'addresses.current.country'],
    fatherName: ['fatherName', 'family.father.name', 'family.guardian.name'],
    occupation: ['occupation', 'family.father.occupation', 'family.guardian.occupation', 'professional.currentTitle'],
    emergencyName: ['emergencyName', 'emergency.name'],
    emergencyContact: ['emergencyContact', 'emergency.mobile']
  };

  function resolveProfileKey(aliasKey, profile) {
    const paths = profilePaths[aliasKey] || [aliasKey];
    return paths.find(path => Object.prototype.hasOwnProperty.call(profile || {}, path) &&
      profile[path] !== undefined && profile[path] !== null && String(profile[path]).trim() !== '')
      || paths.find(path => Object.prototype.hasOwnProperty.call(profile || {}, path))
      || null;
  }

  function findKey(question, profile) {
    const q = normalize(question);
    if (!q) return null;

    // Prefer the longest/specific alias first. This prevents "name" from
    // stealing "Emergency Contact Name", etc.
    const candidates = [];
    for (const [aliasKey, names] of Object.entries(aliases)) {
      for (const alias of names) {
        const a = normalize(alias);
        if (a && (q === a || q.includes(a))) candidates.push({ aliasKey, score: a.length });
      }
    }
    if (candidates.length) {
      candidates.sort((a,b) => b.score - a.score);
      for (const candidate of candidates) {
        const actualKey = resolveProfileKey(candidate.aliasKey, profile);
        if (actualKey) return actualKey;
      }
    }

    // Fallback: match directly against stored profile keys, including dotted keys.
    for (const key of Object.keys(profile || {})) {
      const k = normalize(key.replace(/\./g, ' '));
      if (k && (q === k || q.includes(k))) return key;
    }
    return null;
  }

  function fire(el, type) {
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }

  function setNativeValue(el, value) {
    const val = String(value);
    el.focus();
    if (el.isContentEditable) {
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, val);
    } else if (el.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter ? setter.call(el, val) : (el.value = val);
    } else if (el.tagName === 'INPUT') {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter ? setter.call(el, val) : (el.value = val);
    } else {
      el.value = val;
    }
    fire(el, 'input');
    fire(el, 'change');
    fire(el, 'blur');
    return true;
  }

  function optionText(el) {
    return normalize(
      el.getAttribute('aria-label') ||
      el.getAttribute('data-value') ||
      el.innerText ||
      el.textContent ||
      el.value || ''
    );
  }

  function selectGoogleChoice(el, value) {
    const target = normalize(value);
    if (!target) return false;

    // Native select.
    if (el.tagName === 'SELECT') {
      const option = [...el.options].find(o => {
        const ov = normalize(o.value), ot = normalize(o.textContent);
        return ov === target || ot === target || ot.includes(target) || target.includes(ot);
      });
      if (!option) return false;
      el.value = option.value;
      fire(el, 'input'); fire(el, 'change');
      return true;
    }

    // Google Forms custom radio/checkbox/option controls. Match the visible
    // option text and click the actual control, not the hidden input.
    const item = el.closest('[role="listitem"]');
    const choices = item ? [...item.querySelectorAll('[role="radio"], [role="checkbox"], [role="option"]')] : [];
    const pool = choices.length ? choices : [el];
    const choice = pool.find(c => {
      const text = optionText(c);
      return text === target || text.includes(target) || target.includes(text);
    });
    if (choice) {
      const checked = choice.getAttribute('aria-checked') === 'true' || choice.getAttribute('aria-selected') === 'true';
      if (!checked) choice.click();
      return true;
    }

    // Native radio/checkbox input: compare its own value/label.
    const label = el.labels?.[0]?.innerText || '';
    const own = normalize(el.value || el.getAttribute('aria-label') || label);
    if ((el.type === 'radio' || el.type === 'checkbox') &&
        (own === target || own.includes(target) || target.includes(own))) {
      if (!el.checked) el.click();
      return true;
    }
    return false;
  }

  function fill(profile, manual = false) {
    const fields = getVisibleFields();
    let filled = 0;
    const handledGroups = new Set();

    console.log(`[Formly] detected ${fields.length} visible form fields${manual ? ' (manual)' : ''}`);

    for (const el of fields) {
      // Choice controls are handled by their question group, once per group.
      const isChoice = el.matches('[role="radio"], [role="checkbox"], [role="option"]') ||
        el.type === 'radio' || el.type === 'checkbox' || el.tagName === 'SELECT' || el.getAttribute('role') === 'combobox';

      const question = questionText(el);
      const key = findKey(question, profile);
      if (!key) continue;

      const value = profile[key];
      if (value === undefined || value === null || String(value).trim() === '') continue;

      if (isChoice) {
        const item = el.closest('[role="listitem"]') || el.closest('fieldset') || el.parentElement;
        if (item && handledGroups.has(item)) continue;
        if (item) handledGroups.add(item);
        console.log(`[Formly] choice match: "${normalize(question).slice(0,120)}" -> ${key} = ${value}`);
        if (selectGoogleChoice(el, value)) filled++;
        continue;
      }

      console.log(`[Formly] match: "${normalize(question).slice(0,120)}" -> ${key}`);
      if (setNativeValue(el, value)) filled++;
    }
    return filled;
  }

  let profile = null;
  let automaticDone = false;
  let automaticTimer = null;

  function runAutomaticFill() {
    if (!profile || automaticDone) return;
    automaticDone = true;
    clearTimeout(automaticTimer);
    const count = fill(profile, false);
    console.log(`[Formly] automatic autofill: ${count} fields (done)`);
  }

  function runManualFill() {
    if (!profile) {
      console.log('[Formly] Manual fill requested, but profile is not loaded yet.');
      return 0;
    }
    const count = fill(profile, true);
    console.log(`[Formly] manual autofill: ${count} fields`);
    return count;
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'FILL') {
      profile = msg.profile && typeof msg.profile === 'object' ? msg.profile : {};
      automaticDone = false;
      clearTimeout(automaticTimer);
      // Google Forms can finish rendering a short time after document_idle.
      // Wait once, then fill exactly once. No mutation observer/re-filling loop.
      automaticTimer = setTimeout(runAutomaticFill, 1200);
      console.log('[Formly] profile received; automatic fill scheduled once');
      sendResponse?.({ ok: true, scheduled: true });
      return true;
    }
    if (msg?.type === 'MANUAL_FILL') {
      const count = runManualFill();
      sendResponse?.({ ok: true, filled: count });
      return true;
    }
  });

  // If the profile arrived before the page's load event, use the same one-shot
  // path after load; otherwise CONTENT_READY handles the first request.
  window.addEventListener('load', () => {
    if (profile && !automaticDone) {
      clearTimeout(automaticTimer);
      automaticTimer = setTimeout(runAutomaticFill, 500);
    }
  }, { once: true });

  // Tell the service worker that this page is ready. The worker will fetch the
  // authenticated user's profile from the local Formly server.
  chrome.runtime.sendMessage({ type:'CONTENT_READY' }).catch(() => {});

  // No MutationObserver here: after the automatic fill completes, changing or
  // deleting a value on the form must NOT trigger another automatic fill.
})();
