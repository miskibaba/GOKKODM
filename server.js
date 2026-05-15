// ═══════════════════════════════════════════════════════════════
//  GökKod Platform v1.1 — Backend (Express + MongoDB Atlas)
//  Engin Çimen — GökBilişim © 2025
//  v1.2 — Kayıt hataları düzeltildi
// ═══════════════════════════════════════════════════════════════

const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const crypto   = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── MONGODB BAĞLANTISI ───────────────────────────────────────
const MONGO_URI =
  'mongodb+srv://engincimen:1851Baba.@cluster0.8af3x5i.mongodb.net/GokKodDB?retryWrites=true&w=majority&appName=Cluster0';

mongoose
  .connect(MONGO_URI)
  .then(() => console.log('[GökKod] ✓ MongoDB Atlas bağlandı'))
  .catch((err) => {
    console.error('[GökKod] ✗ MongoDB HATA:', err.message);
    console.error('→ Atlas paneli > Network Access > Add IP (0.0.0.0/0) eklediğinizden emin olun!');
  });

// ─── MIDDLEWARE ───────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ─── KULLANICI ŞEMASI ─────────────────────────────────────────
const kullaniciSema = new mongoose.Schema(
  {
    gokId:        { type: String, required: true, unique: true },
    ad:           { type: String, required: true, trim: true },
    email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
    sifre:        { type: String, required: true },
    rol:          { type: String, enum: ['ogrenci', 'ogretmen'], default: 'ogrenci' },
    sinif_kodu:   { type: String, default: null },
    sinif_id:     { type: String, default: null },
    xp:           { type: Number, default: 0 },
    streak:       { type: Number, default: 0 },
    dosya_sayisi: { type: Number, default: 0 },
    profil:       { type: Object, default: {} },
    aktif:        { type: Boolean, default: true },
    son_giris:    { type: Date,   default: Date.now },
  },
  { timestamps: { createdAt: 'kayit_tarihi', updatedAt: 'guncelleme' } }
);
const Kullanici = mongoose.model('Kullanici', kullaniciSema);

// ─── DOSYA ŞEMASI ─────────────────────────────────────────────
const dosyaSema = new mongoose.Schema(
  {
    gokId:        { type: String, required: true, unique: true },
    kullanici_id: { type: String, required: true, index: true },
    ad:           { type: String, required: true },
    icerik:       { type: String, default: '' },
  },
  { timestamps: { createdAt: 'olusturma', updatedAt: 'guncelleme' } }
);
const Dosya = mongoose.model('Dosya', dosyaSema);

// ─── SINIF ŞEMASI ─────────────────────────────────────────────
const sinifSema = new mongoose.Schema(
  {
    gokId:        { type: String, required: true, unique: true },
    ad:           { type: String, required: true },
    kod:          { type: String, required: true, unique: true },
    ogretmen_id:  { type: String, required: true },
    ogretmen_adi: { type: String, default: '' },
    ogrenciler:   { type: Array,  default: [] },
  },
  { timestamps: { createdAt: 'olusturma' } }
);
const Sinif = mongoose.model('Sinif', sinifSema);

// ─── YARDIMCILAR ─────────────────────────────────────────────
function yeniId(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

function sifreHashle(sifre) {
  return 'gkh_' + crypto
    .createHash('sha256')
    .update('GokBilisim2025_' + sifre.length + '_' + sifre)
    .digest('hex');
}

function kullaniciTemizle(belge) {
  const obj = belge.toObject ? belge.toObject() : Object.assign({}, belge);
  delete obj.sifre;
  delete obj.__v;
  obj.id = obj.gokId;   // Frontend "id" alanı bekliyor
  return obj;
}

// ─── POST /api/kayit ─────────────────────────────────────────
app.post('/api/kayit', async (req, res) => {
  try {
    const { ad, email, sifre, rol, sinif_kodu } = req.body;

    if (!ad || !ad.trim())    return res.status(400).json({ hata: 'Ad zorunludur.' });
    if (!email || !email.trim()) return res.status(400).json({ hata: 'E-posta zorunludur.' });
    if (!sifre || sifre.length < 6) return res.status(400).json({ hata: 'Şifre en az 6 karakter olmalıdır.' });

    const temizEmail = email.toLowerCase().trim();
    const hedefRol   = (rol === 'ogretmen') ? 'ogretmen' : 'ogrenci';

    // E-posta benzersizlik kontrolü
    const mevcut = await Kullanici.findOne({ email: temizEmail });
    if (mevcut) return res.status(409).json({ hata: 'Bu e-posta zaten kayıtlı.' });

    // Sınıf kodu kontrolü
    let sinif_id = null;
    if (hedefRol === 'ogrenci' && sinif_kodu && sinif_kodu.trim()) {
      const sinif = await Sinif.findOne({ kod: sinif_kodu.trim().toUpperCase() });
      if (!sinif) return res.status(400).json({ hata: 'Geçersiz sınıf kodu.' });
      sinif_id = sinif.gokId;
      sinif.ogrenciler.push({ id: yeniId('u'), ad: ad.trim(), email: temizEmail, katilma: new Date().toISOString() });
      await sinif.save();
    }

    const yeniKullanici = new Kullanici({
      gokId:      yeniId('u'),
      ad:         ad.trim(),
      email:      temizEmail,
      sifre:      sifreHashle(sifre),
      rol:        hedefRol,
      sinif_kodu: sinif_kodu ? sinif_kodu.trim().toUpperCase() : null,
      sinif_id,
    });

    await yeniKullanici.save();
    console.log('[GökKod] Kayıt: ' + temizEmail + ' (' + hedefRol + ')');
    return res.status(201).json({ mesaj: 'Kayıt başarılı.', kullanici: kullaniciTemizle(yeniKullanici) });

  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ hata: 'Bu e-posta zaten kayıtlı.' });
    console.error('[GökKod] /api/kayit HATA:', err.message);
    return res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

// ─── POST /api/giris ─────────────────────────────────────────
app.post('/api/giris', async (req, res) => {
  try {
    const { email, sifre } = req.body;
    if (!email || !sifre) return res.status(400).json({ hata: 'E-posta ve şifre zorunludur.' });

    const kullanici = await Kullanici.findOne({ email: email.toLowerCase().trim() });
    if (!kullanici || kullanici.sifre !== sifreHashle(sifre)) {
      return res.status(401).json({ hata: 'E-posta veya şifre hatalı.' });
    }

    kullanici.son_giris = new Date();
    await kullanici.save();
    console.log('[GökKod] Giriş: ' + email);
    return res.json({ mesaj: 'Giriş başarılı.', kullanici: kullaniciTemizle(kullanici) });

  } catch (err) {
    console.error('[GökKod] /api/giris HATA:', err.message);
    return res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

// ─── GET /api/kullanici/:id ───────────────────────────────────
app.get('/api/kullanici/:id', async (req, res) => {
  try {
    const k = await Kullanici.findOne({ gokId: req.params.id }).select('-sifre -__v');
    if (!k) return res.status(404).json({ hata: 'Kullanıcı bulunamadı.' });
    const obj = k.toObject(); obj.id = obj.gokId;
    return res.json(obj);
  } catch (err) { return res.status(500).json({ hata: err.message }); }
});

// ─── PUT /api/kullanici/:id ───────────────────────────────────
app.put('/api/kullanici/:id', async (req, res) => {
  try {
    const izinli = ['xp', 'streak', 'dosya_sayisi', 'profil', 'ad'];
    const set = {};
    izinli.forEach(a => { if (req.body[a] !== undefined) set[a] = req.body[a]; });
    const k = await Kullanici.findOneAndUpdate({ gokId: req.params.id }, { $set: set }, { new: true }).select('-sifre -__v');
    if (!k) return res.status(404).json({ hata: 'Kullanıcı bulunamadı.' });
    const obj = k.toObject(); obj.id = obj.gokId;
    return res.json(obj);
  } catch (err) { return res.status(500).json({ hata: err.message }); }
});

// ─── POST /api/dosya ─────────────────────────────────────────
app.post('/api/dosya', async (req, res) => {
  try {
    const dosya = new Dosya({ gokId: yeniId('f'), kullanici_id: req.body.kullanici_id, ad: req.body.ad, icerik: req.body.icerik || '' });
    await dosya.save();
    const obj = dosya.toObject(); obj.id = obj.gokId;
    return res.status(201).json(obj);
  } catch (err) { return res.status(500).json({ hata: err.message }); }
});

// ─── GET /api/dosyalar/:kullanici_id ─────────────────────────
app.get('/api/dosyalar/:kullanici_id', async (req, res) => {
  try {
    const dosyalar = await Dosya.find({ kullanici_id: req.params.kullanici_id }).select('-__v').sort({ guncelleme: -1 });
    return res.json(dosyalar.map(d => { const o = d.toObject(); o.id = o.gokId; return o; }));
  } catch (err) { return res.status(500).json({ hata: err.message }); }
});

// ─── PUT /api/dosya/:id ───────────────────────────────────────
app.put('/api/dosya/:id', async (req, res) => {
  try {
    const d = await Dosya.findOneAndUpdate({ gokId: req.params.id }, { $set: { icerik: req.body.icerik } }, { new: true });
    if (!d) return res.status(404).json({ hata: 'Dosya bulunamadı.' });
    const obj = d.toObject(); obj.id = obj.gokId;
    return res.json(obj);
  } catch (err) { return res.status(500).json({ hata: err.message }); }
});

// ─── DELETE /api/dosya/:id ────────────────────────────────────
app.delete('/api/dosya/:id', async (req, res) => {
  try {
    await Dosya.findOneAndDelete({ gokId: req.params.id });
    return res.json({ mesaj: 'Dosya silindi.' });
  } catch (err) { return res.status(500).json({ hata: err.message }); }
});

// ─── GET /api/siralama ────────────────────────────────────────
app.get('/api/siralama', async (req, res) => {
  try {
    const liste = await Kullanici.find({}).select('gokId ad xp rol').sort({ xp: -1 }).limit(20);
    return res.json(liste.map(u => { const o = u.toObject(); o.id = o.gokId; return o; }));
  } catch (err) { return res.status(500).json({ hata: err.message }); }
});

// ─── POST /api/sinif ─────────────────────────────────────────
app.post('/api/sinif', async (req, res) => {
  try {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let kod = 'GK-';
    for (let i = 0; i < 3; i++) kod += chars[Math.floor(Math.random() * chars.length)];
    kod += '-';
    for (let i = 0; i < 4; i++) kod += chars[Math.floor(Math.random() * chars.length)];
    const s = new Sinif({ gokId: yeniId('s'), ad: req.body.ad, kod, ogretmen_id: req.body.ogretmen_id, ogretmen_adi: req.body.ogretmen_adi || '' });
    await s.save();
    const obj = s.toObject(); obj.id = obj.gokId;
    return res.status(201).json(obj);
  } catch (err) { return res.status(500).json({ hata: err.message }); }
});

// ─── GET /api/test — bağlantı kontrolü ───────────────────────
app.get('/api/test', (req, res) => {
  const durumlar = { 0: 'bağlı değil ✗', 1: 'bağlı ✓', 2: 'bağlanıyor...', 3: 'kesiliyor...' };
  res.json({
    sunucu: 'çalışıyor ✓',
    mongoDB: durumlar[mongoose.connection.readyState] || 'bilinmiyor',
    zaman: new Date().toLocaleString('tr-TR'),
  });
});

// ─── SUNUCU BAŞLAT ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  GökKod API → http://localhost:' + PORT + '      ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log('║  /api/test   → MongoDB bağlantı testi    ║');
  console.log('║  /api/kayit  → Kayıt ol (POST)           ║');
  console.log('║  /api/giris  → Giriş yap (POST)          ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
  console.log('→ Tarayıcıda aç: http://localhost:' + PORT);
  console.log('→ Bağlantı testi: http://localhost:' + PORT + '/api/test');
});