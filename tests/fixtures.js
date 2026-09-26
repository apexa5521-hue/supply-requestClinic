/** بيانات تجريبية مشتركة بين اختبارات الباك-إند واختبارات المتصفح */
(function (root) {
  function seedFixtures(gas) {
    gas.seed('Roles', ['RoleName', 'Screen'], [
      ['ممرضة', 'nurse'], ['تموين', 'procurement'], ['طبيب', 'doctor'],
      ['جودة', 'dashboard'], ['تنفيذي', 'admin']
    ]);
    // كلمات سر نصية قديمة (legacy) — يجب أن تُرقّى تلقائياً لمشفّرة بعد أول دخول
    gas.seed('Users', ['Name', 'Password', 'Role', 'Clinic', 'Email'], [
      ['سارة', '1111', 'ممرضة', 'عيادة الأسنان 1, عيادة الجلدية 1', 'sara@example.com'],
      ['ريم', '2222', 'ممرضة', 'عيادة الأسنان 2', ''],
      ['علي', '3333', 'تموين', '', 'ali@example.com'],
      ['د. خالد', '4444', 'طبيب', '', 'khaled@example.com'],
      ['منى', '5555', 'جودة', '', 'mona@example.com'],
      ['المدير', '1234', 'تنفيذي', '', 'boss@example.com']
    ]);
    gas.seed('Clinics', ['ClinicName', 'Branch', 'Type'], [
      ['عيادة الأسنان 1', 'الرياض', 'أسنان'], ['عيادة الأسنان 2', 'جدة', 'أسنان'], ['عيادة الجلدية 1', 'الرياض', 'جلدية']
    ]);
    gas.seed('Doctors', ['DoctorName', 'Clinic', 'NurseName', 'Subspecialty'], [
      ['د. خالد', 'عيادة الأسنان 1', 'سارة', 'تقويم'],
      ['د. نورة', 'عيادة الأسنان 1', 'سارة', ''],      // بدون حساب — يمكن الإرسال بدون مراجعة
      ['د. فهد', 'عيادة الجلدية 1', 'سارة', 'ليزر'],
      ['د. سعد', 'عيادة الأسنان 2', 'ريم', '']
    ]);
    gas.seed('ItemsCatalog', ['ItemName', 'CommercialName', 'Category', 'Price'], [
      ['MICRO BRUSH FINE', 'TPC Micro', 'Consumables', 45],
      ['PROPHY PASTE', 'Nupro', 'Hygiene', 60],
      ['DENTAL FLOSS', 'Oral-B', 'Hygiene', 12.5],
      ['Etchant Blue Tip', '3M Scotchbond', 'Bonding', 38],
      ['Ivoclar Tetric-N A2', 'Tetric N-Ceram', 'Composite', 120],
      ['Itero Sleeve', 'Align', 'Scanner', 300],
      ['قفازات طبية M', 'Sri Trang', 'Protection', 25]
    ]);
    return gas;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { seedFixtures };
  else root.seedFixtures = seedFixtures;
})(typeof window !== 'undefined' ? window : globalThis);
