
import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import "./App.css";

function App() {
  const [role, setRole] = useState(null);
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const [loginMode, setLoginMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [classLevel, setClassLevel] = useState("8. Sınıf");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const [active, setActive] = useState("Genel Bakış");
  const [applications, setApplications] = useState([]);
  const [applicationError, setApplicationError] = useState("");
  const [loadingApplications, setLoadingApplications] = useState(false);

  const [students, setStudents] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("matematik-ogrenciler")) || [];
    } catch {
      return [];
    }
  });

  const [homework, setHomework] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("matematik-odevler")) || [];
    } catch {
      return [];
    }
  });

  const [showForm, setShowForm] = useState(false);
  const [showHomeworkForm, setShowHomeworkForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [homeworkSearch, setHomeworkSearch] = useState("");
  const [homeworkFilter, setHomeworkFilter] = useState("Tümü");

  const emptyForm = {
    name: "", phone: "", grade: "", parent: "",
    parentPhone: "", fee: "", days: [],
  };

  const today = new Date().toLocaleDateString("en-CA");

  const emptyHomework = {
    studentId: "", title: "", subject: "", details: "",
    pages: "", assignedDate: today, dueDate: today,
  };

  const [form, setForm] = useState(emptyForm);
  const [homeworkForm, setHomeworkForm] = useState(emptyHomework);

  useEffect(() => {
    localStorage.setItem("matematik-ogrenciler", JSON.stringify(students));
  }, [students]);

  useEffect(() => {
    localStorage.setItem("matematik-odevler", JSON.stringify(homework));
  }, [homework]);

  async function checkUser(userToCheck) {
    if (!userToCheck) {
      setRole(null);
      setUser(null);
      return;
    }

    // Önce kullanıcının öğretmen olup olmadığını kontrol et.
    const { data: teacher, error: teacherError } = await supabase
      .from("teachers")
      .select("id,email")
      .eq("id", userToCheck.id)
      .maybeSingle();

    if (teacherError) {
      console.error(teacherError);
      await supabase.auth.signOut();
      setRole(null);
      setUser(null);
      setMessage("Hesap kontrol edilemedi: " + teacherError.message);
      return;
    }

    if (teacher) {
      setUser(userToCheck);
      setRole("teacher");
      setMessage("");
      return;
    }

    // Öğretmen değilse öğrenci kaydını kontrol et.
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id,full_name,class_level,username,approval_status")
      .eq("id", userToCheck.id)
      .maybeSingle();

    if (studentError) {
      console.error(studentError);
      await supabase.auth.signOut();
      setRole(null);
      setUser(null);
      setMessage("Öğrenci hesabı kontrol edilemedi: " + studentError.message);
      return;
    }

    if (!student) {
      await supabase.auth.signOut();
      setRole(null);
      setUser(null);
      setMessage("Bu hesaba ait öğrenci kaydı bulunamadı.");
      return;
    }

    if (student.approval_status !== "approved") {
      await supabase.auth.signOut();
      setRole(null);
      setUser(null);

      setMessage(
        student.approval_status === "pending"
          ? "Başvurun henüz öğretmen tarafından onaylanmadı."
          : "Başvurun reddedilmiş. Öğretmeninle iletişime geç."
      );
      return;
    }

    setUser({ ...userToCheck, student });
    setRole("student");
    setMessage("");
  }

  useEffect(() => {
    async function start() {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        await checkUser(data.session.user);
      }
      setCheckingSession(false);
    }
    start();
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setBusy(true);
    setMessage("");

    const entered = username.trim().toLowerCase();
    const email = entered.includes("@")
      ? entered
      : `${entered}@students.example.com`;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage("Giriş yapılamadı. Kullanıcı adı veya şifreni kontrol et.");
      setBusy(false);
      return;
    }

    await checkUser(data.user);
    setBusy(false);
  }

  async function handleRegister(e) {
    e.preventDefault();
    setBusy(true);
    setMessage("");

    const { data, error } = await supabase.functions.invoke(
      "student-registration",
      {
        body: {
          username: username.trim().toLowerCase(),
          full_name: fullName.trim(),
          class_level: classLevel,
          password,
        },
      }
    );

    if (error) {
      setMessage(error.message || "Kayıt sırasında bir hata oluştu.");
      setBusy(false);
      return;
    }

    if (data?.success) {
      setMessage("Başvurun alındı! Öğretmen onayından sonra giriş yapabilirsin.");
      setLoginMode("login");
      setUsername("");
      setPassword("");
      setFullName("");
    } else {
      setMessage(data?.error || "Kayıt oluşturulamadı.");
    }

    setBusy(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    setRole(null);
    setUser(null);
    setUsername("");
    setPassword("");
    setMessage("");
    setActive("Genel Bakış");
  }

  async function loadApplications() {
    setLoadingApplications(true);
    setApplicationError("");

    const { data, error } = await supabase
      .from("students")
      .select("*")
      .eq("approval_status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      setApplicationError(error.message);
    } else {
      setApplications(data || []);
    }

    setLoadingApplications(false);
  }

  async function updateApplication(id, status) {
    const { error } = await supabase
      .from("students")
      .update({ approval_status: status })
      .eq("id", id);

    if (error) {
      alert("İşlem yapılamadı: " + error.message);
      return;
    }

    await loadApplications();
  }

  useEffect(() => {
    if (role === "teacher") loadApplications();
  }, [role]);

  const menu = [
    "Genel Bakış",
    "Öğrenci Başvuruları",
    "Öğrencilerim",
    "Ödev Takibi",
    "Ders Programı",
    "Sınavlar",
    "Raporlar",
  ];

  function openNewForm() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  }

  function saveStudent(e) {
    e.preventDefault();

    if (editingId !== null) {
      setStudents(old =>
        old.map(s => s.id === editingId ? { ...form, id: editingId } : s)
      );
    } else {
      setStudents(old => [...old, { ...form, id: Date.now() }]);
    }

    setShowForm(false);
    setForm(emptyForm);
    setEditingId(null);
  }

  function editStudent(student) {
    setForm({ ...emptyForm, ...student });
    setEditingId(student.id);
    setShowForm(true);
  }

  function deleteStudent(id) {
    if (window.confirm("Bu öğrenciyi silmek istediğine emin misin?")) {
      setStudents(old => old.filter(s => s.id !== id));
    }
  }

  function toggleDay(day) {
    setForm(old => ({
      ...old,
      days: old.days.includes(day)
        ? old.days.filter(d => d !== day)
        : [...old.days, day],
    }));
  }

  function openHomeworkForm() {
    setHomeworkForm({
      ...emptyHomework,
      studentId: students.length ? String(students[0].id) : "",
    });
    setShowHomeworkForm(true);
  }

  function saveHomework(e) {
    e.preventDefault();

    const student = students.find(
      s => String(s.id) === homeworkForm.studentId
    );

    if (!student) {
      alert("Lütfen bir öğrenci seç.");
      return;
    }

    const newHomework = {
      ...homeworkForm,
      id: Date.now(),
      studentId: student.id,
      studentName: student.name,
      status: "Bekliyor",
    };

    setHomework(old => [newHomework, ...old]);
    setShowHomeworkForm(false);
    setHomeworkForm(emptyHomework);
  }

  function toggleHomework(id) {
    setHomework(old =>
      old.map(item =>
        item.id === id
          ? {
              ...item,
              status: item.status === "Tamamlandı"
                ? "Bekliyor"
                : "Tamamlandı",
            }
          : item
      )
    );
  }

  function deleteHomework(id) {
    if (window.confirm("Bu ödevi silmek istediğine emin misin?")) {
      setHomework(old => old.filter(item => item.id !== id));
    }
  }

  function formatDate(date) {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("tr-TR");
  }

  const filteredStudents = students.filter(s =>
    (s.name || "").toLocaleLowerCase("tr").includes(search.toLocaleLowerCase("tr"))
  );

  const filteredHomework = homework.filter(item => {
    const matchesSearch =
      (item.title || "").toLocaleLowerCase("tr").includes(homeworkSearch.toLocaleLowerCase("tr")) ||
      (item.studentName || "").toLocaleLowerCase("tr").includes(homeworkSearch.toLocaleLowerCase("tr")) ||
      (item.subject || "").toLocaleLowerCase("tr").includes(homeworkSearch.toLocaleLowerCase("tr"));

    return matchesSearch &&
      (homeworkFilter === "Tümü" || item.status === homeworkFilter);
  });

  const completedCount = homework.filter(
    item => item.status === "Tamamlandı"
  ).length;

  const pendingCount = homework.filter(
    item => item.status === "Bekliyor"
  ).length;

  if (checkingSession) {
    return <div className="app"><main className="main"><h2>Matematik Atölyem açılıyor...</h2></main></div>;
  }

  // GİRİŞ VE ÖĞRENCİ KAYIT EKRANI
  if (!role) {
    return (
      <div className="app">
        <main className="main" style={{ maxWidth: 520, margin: "50px auto", width: "100%" }}>
          <section className="panel" style={{ padding: 32 }}>
            <div className="brand" style={{ marginBottom: 30 }}>
              <div className="brand-icon">π</div>
              <div><h2>Matematik</h2><span>ATÖLYEM</span></div>
            </div>

            <h1>{loginMode === "login" ? "Hoş Geldin!" : "Öğrenci Kaydı"}</h1>
            <p>
              {loginMode === "login"
                ? "Hesabına giriş yaparak devam et."
                : "Öğrenci başvurunu oluştur."}
            </p>

            <form onSubmit={loginMode === "login" ? handleLogin : handleRegister}>
              {loginMode === "register" && (
                <>
                  <label>Ad Soyad</label>
                  <input
                    required
                    minLength="2"
                    maxLength="80"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Adın ve soyadın"
                  />

                  <label>Sınıfın</label>
                  <select
                    value={classLevel}
                    onChange={e => setClassLevel(e.target.value)}
                  >
                    {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => (
                      <option key={n} value={`${n}. Sınıf`}>{n}. Sınıf</option>
                    ))}
                  </select>
                </>
              )}

              <label>{loginMode === "login" ? "E-posta veya öğrenci kullanıcı adı" : "Kullanıcı adı"}</label>
              <input
                required
                autoComplete="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder={loginMode === "login" ? "E-posta veya kullanıcı adı" : "Örn. ahmet_123"}
              />

              <label>Şifre</label>
              <input
                required
                minLength={loginMode === "register" ? 8 : undefined}
                type="password"
                autoComplete={loginMode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Şifren"
              />

              {message && (
                <p style={{ padding: 12, borderRadius: 8, background: "#f3f0ff" }}>
                  {message}
                </p>
              )}

              <button className="primary" type="submit" disabled={busy} style={{ width: "100%", marginTop: 18 }}>
                {busy
                  ? "Lütfen bekle..."
                  : loginMode === "login" ? "Giriş Yap" : "Başvuru Oluştur"}
              </button>
            </form>

            <div style={{ textAlign: "center", marginTop: 22 }}>
              {loginMode === "login" ? (
                <button className="secondary" onClick={() => { setLoginMode("register"); setMessage(""); }}>
                  Öğrenci Olarak Kayıt Ol
                </button>
              ) : (
                <button className="secondary" onClick={() => { setLoginMode("login"); setMessage(""); }}>
                  Giriş Ekranına Dön
                </button>
              )}
            </div>
          </section>
        </main>
      </div>
    );
  }

  // ÖĞRENCİ PANELİ
  if (role === "student") {
    const student = user.student;

    return (
      <div className="app">
        <main className="main" style={{ width: "100%" }}>
          <header className="topbar">
            <div>
              <span className="welcome">MATEMATİK ATÖLYEM</span>
              <h1>Öğrenci Paneli</h1>
            </div>
            <button className="secondary" onClick={logout}>Çıkış Yap</button>
          </header>

          <section className="welcome-card">
            <div>
              <span className="welcome-label">ÖĞRENCİ ALANI</span>
              <h2>Hoş geldin, {student.full_name}! ✨</h2>
              <p>{student.class_level || "Öğrenci"} · Öğrenmeye hazır mısın?</p>
            </div>
            <div className="math-decoration">π</div>
          </section>

          <section className="panel">
            <h2>Ödevlerin</h2>
            <p>Ödev takip bölümünü bir sonraki aşamada öğretmen paneline bağlayacağız.</p>
          </section>
        </main>
      </div>
    );
  }

  // ÖĞRETMEN PANELİ
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">π</div>
          <div><h2>Matematik</h2><span>ATÖLYEM</span></div>
        </div>

        <p className="menu-title">MENÜ</p>

        <nav>
          {menu.map((item, index) => (
            <button
              key={item}
              className={active === item ? "menu-item selected" : "menu-item"}
              onClick={() => {
                setActive(item);
                setShowForm(false);
                setShowHomeworkForm(false);
                if (item === "Öğrenci Başvuruları") loadApplications();
              }}
            >
              <span>{["⌂", "✉", "♙", "▤", "▦", "✎", "▥"][index]}</span>
              {item}
              {item === "Öğrenci Başvuruları" && applications.length > 0 && (
                <span className="status">{applications.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="teacher-avatar">Ö</div>
          <div><strong>Öğretmen Paneli</strong><small>{user?.email}</small></div>
        </div>
        <button className="secondary" onClick={logout} style={{ margin: 12 }}>Çıkış</button>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <span className="welcome">MATEMATİK ATÖLYEM</span>
            <h1>{active}</h1>
          </div>
          <div className="top-right">
            <span className="today">✦ Öğretmen çalışma alanı</span>
            <div className="profile">Ö</div>
          </div>
        </header>

        {active === "Genel Bakış" && (
          <>
            <section className="welcome-card">
              <div>
                <span className="welcome-label">ÖĞRETMEN PANELİNE HOŞ GELDİN</span>
                <h2>Başarı birlikte büyür! ✨</h2>
                <p>Öğrencilerini, derslerini ve ödevlerini tek bir yerden yönet.</p>
              </div>
              <div className="math-decoration">∑<br />π × ∞</div>
            </section>

            <section className="stats">
              <div className="stat-card">
                <div className="stat-icon purple">♙</div>
                <span>Toplam Öğrenci</span>
                <strong>{students.length}</strong>
                <small>Kayıtlı öğrenci</small>
              </div>
              <div className="stat-card">
                <div className="stat-icon orange">✉</div>
                <span>Bekleyen Başvuru</span>
                <strong>{applications.length}</strong>
                <small>Onay bekliyor</small>
              </div>
              <div className="stat-card">
                <div className="stat-icon green">✓</div>
                <span>Tamamlanan Ödev</span>
                <strong>{completedCount}</strong>
                <small>Öğrenci ilerlemesi</small>
              </div>
              <div className="stat-card">
                <div className="stat-icon blue">◷</div>
                <span>Bekleyen Ödev</span>
                <strong>{pendingCount}</strong>
                <small>Henüz tamamlanmadı</small>
              </div>
            </section>

            <section className="content-grid">
              <div className="panel">
                <div className="panel-heading">
                  <div><h3>Son Öğrenciler</h3><p>Öğrenci kayıtlarını takip et.</p></div>
                  <button onClick={() => setActive("Öğrencilerim")}>Tümünü gör →</button>
                </div>
                {students.length === 0 ? (
                  <div className="empty">
                    <div className="empty-icon">♙</div>
                    <strong>Henüz öğrencin yok</strong>
                    <p>İlk öğrencini ekleyerek başlayabilirsin.</p>
                    <button className="primary" onClick={openNewForm}>+ Öğrenci ekle</button>
                  </div>
                ) : (
                  <div className="student-mini-list">
                    {students.slice(-4).reverse().map(s => (
                      <div className="student-mini" key={s.id}>
                        <div className="student-avatar">{(s.name || "?").charAt(0).toLocaleUpperCase("tr")}</div>
                        <div><strong>{s.name}</strong><small>{s.grade} · {s.phone}</small></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="panel">
                <div className="panel-heading">
                  <div><h3>Ödev Takibi</h3><p>Verdiğin ödevlerin durumu.</p></div>
                  <span className="status">Aktif</span>
                </div>
                <div className="homework-summary">
                  <div><strong>{homework.length}</strong><span>Toplam ödev</span></div>
                  <div><strong>{pendingCount}</strong><span>Bekleyen</span></div>
                  <div><strong>{completedCount}</strong><span>Tamamlanan</span></div>
                </div>
                <button className="secondary homework-go" onClick={() => setActive("Ödev Takibi")}>
                  Ödevleri görüntüle →
                </button>
              </div>
            </section>
          </>
        )}

        {active === "Öğrenci Başvuruları" && (
          <section className="panel students-panel">
            <div className="student-toolbar">
              <div>
                <h2>Öğrenci Başvuruları</h2>
                <p>Supabase üzerinden gelen kayıt talepleri.</p>
              </div>
              <button className="secondary" onClick={loadApplications}>↻ Yenile</button>
            </div>

            {loadingApplications && <p>Başvurular yükleniyor...</p>}

            {applicationError && (
              <div className="empty">
                <strong>Başvurular yüklenemedi.</strong>
                <p>{applicationError}</p>
              </div>
            )}

            {!loadingApplications && !applicationError && applications.length === 0 && (
              <div className="empty">
                <div className="empty-icon">✉</div>
                <strong>Bekleyen başvuru bulunmuyor.</strong>
                <p>Yeni öğrenci kayıtları burada görünecek.</p>
              </div>
            )}

            <div className="student-list">
              {applications.map(student => (
                <div className="student-card" key={student.id}>
                  <div className="student-avatar">
                    {(student.full_name || "?").charAt(0).toLocaleUpperCase("tr")}
                  </div>
                  <div className="student-info">
                    <strong>{student.full_name}</strong>
                    <span>{student.class_level || "Sınıf belirtilmedi"}</span>
                    <small>Kullanıcı adı: {student.username || "-"}</small>
                    <small>Başvuru: {formatDate(student.created_at)}</small>
                    <small>Durum: Bekliyor</small>
                  </div>
                  <div className="student-actions">
                    <button className="primary" onClick={() => updateApplication(student.id, "approved")}>
                      Onayla
                    </button>
                    <button className="delete-btn" onClick={() => updateApplication(student.id, "rejected")}>
                      Reddet
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {active === "Öğrencilerim" && (
          <section className="panel students-panel">
            <div className="student-toolbar">
              <div>
                <h2>Öğrenci Listesi</h2>
                <p>{students.length} kayıtlı öğrencin bulunuyor.</p>
              </div>
              <button className="primary" onClick={openNewForm}>+ Yeni Öğrenci Ekle</button>
            </div>

            <input className="search-input" placeholder="Öğrenci adına göre ara..."
              value={search} onChange={e => setSearch(e.target.value)} />

            {filteredStudents.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">♙</div>
                <strong>{search ? "Öğrenci bulunamadı" : "Henüz öğrenci eklenmedi"}</strong>
                <p>{search ? "Arama kelimeni değiştirebilirsin." : "İlk öğrencini ekleyerek kayıt oluşturmaya başla."}</p>
                {!search && <button className="primary" onClick={openNewForm}>+ Öğrenci ekle</button>}
              </div>
            ) : (
              <div className="student-list">
                {filteredStudents.map(s => (
                  <div className="student-card" key={s.id}>
                    <div className="student-avatar">{(s.name || "?").charAt(0).toLocaleUpperCase("tr")}</div>
                    <div className="student-info">
                      <strong>{s.name}</strong>
                      <span>{s.grade} · {s.phone}</span>
                      <small>Ders günleri: {(s.days || []).join(", ") || "Belirtilmedi"}</small>
                      <small>Ders ücreti: {s.fee ? `${s.fee} TL` : "Belirtilmedi"}</small>
                    </div>
                    <div className="student-actions">
                      <button className="secondary" onClick={() => editStudent(s)}>Düzenle</button>
                      <button className="delete-btn" onClick={() => deleteStudent(s.id)}>Sil</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {active === "Ödev Takibi" && (
          <section className="panel students-panel">
            <div className="student-toolbar">
              <div>
                <h2>Ödev Yönetimi</h2>
                <p>{homework.length} ödev kaydı · {pendingCount} bekleyen ödev</p>
              </div>
              <button className="primary" onClick={openHomeworkForm} disabled={students.length === 0}>
                + Yeni Ödev Ata
              </button>
            </div>

            {students.length === 0 && (
              <div className="empty">
                <strong>Ödev atamak için önce öğrenci eklemelisin.</strong>
                <button className="primary" onClick={() => setActive("Öğrencilerim")}>Öğrencilere git</button>
              </div>
            )}

            {homework.length > 0 && (
              <>
                <input className="search-input" placeholder="Ödev, konu veya öğrenci ara..."
                  value={homeworkSearch} onChange={e => setHomeworkSearch(e.target.value)} />
                <div className="homework-filters">
                  {["Tümü", "Bekliyor", "Tamamlandı"].map(filter => (
                    <button key={filter}
                      className={homeworkFilter === filter ? "filter-button active-filter" : "filter-button"}
                      onClick={() => setHomeworkFilter(filter)}>
                      {filter}
                    </button>
                  ))}
                </div>
              </>
            )}

            {filteredHomework.length === 0 ? (
              <div className="empty">
                <strong>Gösterilecek ödev bulunamadı.</strong>
                {students.length > 0 && <button className="primary" onClick={openHomeworkForm}>+ İlk ödevi ata</button>}
              </div>
            ) : (
              <div className="homework-list">
                {filteredHomework.map(item => (
                  <div className="homework-card" key={item.id}>
                    <div className="homework-card-top">
                      <div>
                        <span className="homework-student">{item.studentName}</span>
                        <h3>{item.title}</h3>
                        <p>{item.subject || "Konu belirtilmedi"}</p>
                      </div>
                      <span className={item.status === "Tamamlandı" ? "homework-status completed" : "homework-status pending"}>
                        {item.status}
                      </span>
                    </div>
                    {item.details && <p className="homework-details">{item.details}</p>}
                    <div className="homework-meta">
                      {item.pages && <span>📖 {item.pages}</span>}
                      <span>Veriliş: {formatDate(item.assignedDate)}</span>
                      <span>Son tarih: {formatDate(item.dueDate)}</span>
                    </div>
                    <div className="homework-actions">
                      <button className="secondary" onClick={() => toggleHomework(item.id)}>
                        {item.status === "Tamamlandı" ? "Bekliyor olarak işaretle" : "✓ Tamamlandı"}
                      </button>
                      <button className="delete-btn" onClick={() => deleteHomework(item.id)}>Sil</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {active !== "Genel Bakış" &&
          active !== "Öğrenci Başvuruları" &&
          active !== "Öğrencilerim" &&
          active !== "Ödev Takibi" && (
            <section className="panel empty">
              <div className="empty-icon">✦</div>
              <strong>{active} modülü sıradaki geliştirmelerimiz arasında.</strong>
              <p>Bu bölümü birlikte çalışır hale getireceğiz.</p>
            </section>
          )}

        <footer>© 2026 Matematik Atölyem · Öğrenmek, gelişmek, başarmak.</footer>
      </main>

      {showForm && (
        <div className="modal-overlay">
          <form className="student-form" onSubmit={saveStudent}>
            <div className="form-heading">
              <div>
                <h2>{editingId !== null ? "Öğrenciyi Düzenle" : "Yeni Öğrenci Ekle"}</h2>
                <p>Öğrenci bilgilerini eksiksiz doldur.</p>
              </div>
              <button type="button" className="close-btn" onClick={() => setShowForm(false)}>✕</button>
            </div>

            <label>Adı Soyadı *</label>
            <input required value={form.name} placeholder="Örn. Ahmet Yılmaz"
              onChange={e => setForm({...form, name: e.target.value})} />

            <div className="form-row">
              <div>
                <label>Telefon Numarası</label>
                <input value={form.phone} placeholder="05XX XXX XX XX"
                  onChange={e => setForm({...form, phone: e.target.value})} />
              </div>
              <div>
                <label>Sınıfı</label>
                <select value={form.grade} onChange={e => setForm({...form, grade: e.target.value})}>
                  <option value="">Sınıf seç</option>
                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(n =>
                    <option key={n} value={`${n}. Sınıf`}>{n}. Sınıf</option>
                  )}
                </select>
              </div>
            </div>

            <label>Veli Adı Soyadı</label>
            <input value={form.parent} placeholder="Veli adı"
              onChange={e => setForm({...form, parent: e.target.value})} />

            <label>Veli Telefonu</label>
            <input value={form.parentPhone} placeholder="05XX XXX XX XX"
              onChange={e => setForm({...form, parentPhone: e.target.value})} />

            <label>Ders Ücreti (TL)</label>
            <input type="number" min="0" value={form.fee} placeholder="Örn. 1000"
              onChange={e => setForm({...form, fee: e.target.value})} />

            <label>Ders Günleri</label>
            <div className="day-options">
              {["Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi","Pazar"].map(day => (
                <button type="button" key={day}
                  className={form.days.includes(day) ? "day selected-day" : "day"}
                  onClick={() => toggleDay(day)}>{day}</button>
              ))}
            </div>

            <div className="form-actions">
              <button type="button" className="secondary" onClick={() => setShowForm(false)}>Vazgeç</button>
              <button type="submit" className="primary">Kaydet</button>
            </div>
          </form>
        </div>
      )}

      {showHomeworkForm && (
        <div className="modal-overlay">
          <form className="student-form" onSubmit={saveHomework}>
            <div className="form-heading">
              <div>
                <h2>Yeni Ödev Ata</h2>
                <p>Öğrencine ait ödev bilgilerini gir.</p>
              </div>
              <button type="button" className="close-btn" onClick={() => setShowHomeworkForm(false)}>✕</button>
            </div>

            <label>Öğrenci *</label>
            <select required value={homeworkForm.studentId}
              onChange={e => setHomeworkForm({...homeworkForm, studentId: e.target.value})}>
              <option value="">Öğrenci seç</option>
              {students.map(s => (
                <option key={s.id} value={String(s.id)}>{s.name} - {s.grade}</option>
              ))}
            </select>

            <label>Ödev Başlığı *</label>
            <input required value={homeworkForm.title}
              placeholder="Örn. Test kitabı 3. ünite"
              onChange={e => setHomeworkForm({...homeworkForm, title: e.target.value})} />

            <label>Konu</label>
            <input value={homeworkForm.subject}
              placeholder="Örn. Rasyonel sayılar"
              onChange={e => setHomeworkForm({...homeworkForm, subject: e.target.value})} />

            <label>Sayfa / Kitap Bilgisi</label>
            <input value={homeworkForm.pages}
              placeholder="Örn. Sayfa 45-48, Test 3"
              onChange={e => setHomeworkForm({...homeworkForm, pages: e.target.value})} />

            <label>Açıklama</label>
            <textarea rows="3" value={homeworkForm.details}
              placeholder="Ödevle ilgili ek notlar..."
              onChange={e => setHomeworkForm({...homeworkForm, details: e.target.value})} />

            <div className="form-row">
              <div>
                <label>Veriliş Tarihi *</label>
                <input type="date" required value={homeworkForm.assignedDate}
                  onChange={e => setHomeworkForm({...homeworkForm, assignedDate: e.target.value})} />
              </div>
              <div>
                <label>Son Teslim Tarihi *</label>
                <input type="date" required min={homeworkForm.assignedDate}
                  value={homeworkForm.dueDate}
                  onChange={e => setHomeworkForm({...homeworkForm, dueDate: e.target.value})} />
              </div>
            </div>

            <div className="form-actions">
              <button type="button" className="secondary" onClick={() => setShowHomeworkForm(false)}>Vazgeç</button>
              <button type="submit" className="primary">Ödevi Kaydet</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;
