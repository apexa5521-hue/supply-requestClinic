/** بيانات تجريبية مشتركة بين اختبارات الباك-إند واختبارات المتصفح */
(function (root) {
  function seedFixtures(gas) {
    gas.seed('Roles', ['RoleName', 'Screen'], [
      ['ممرضة', 'nurse'], ['تموين', 'procurement'], ['طبيب', 'doctor'],
      ['جودة', 'quality'], ['تنفيذي', 'executive'], ['مالية', 'finance'], ['أدمن', 'admin'], ['المعمل', 'lab']
    ]);
    // كلمات سر نصية قديمة (legacy) — يجب أن تُرقّى تلقائياً لمشفّرة بعد أول دخول
    // د. خالد مُنح الأسعار (الافتراضي للأطباء: بدون أسعار)
    gas.seed('Users', ['Name', 'Password', 'Role', 'Clinic', 'Email', 'PriceView'], [
      ['سارة', '1111', 'ممرضة', 'عيادة الأسنان 1, عيادة الجلدية 1', 'sara@example.com'],
      ['ريم', '2222', 'ممرضة', 'عيادة الأسنان 2', ''],
      ['علي', '3333', 'تموين', '', 'ali@example.com'],
      ['د. خالد', '4444', 'طبيب', '', 'khaled@example.com', 'يرى الأسعار'],
      ['منى', '5555', 'جودة', '', 'mona@example.com'],
      ['المدير', '1234', 'أدمن', '', 'boss@example.com'],
      ['فيصل', '6666', 'تنفيذي', '', 'exec@example.com'],
      ['نواف', '7777', 'مالية', '', 'fin@example.com'],
      ['فني المعمل', '8888', 'المعمل', '', 'lab@example.com']
    ]);
    gas.seed('Clinics', ['ClinicName', 'Branch', 'Type'], [
      ['عيادة الأسنان 1', 'الرياض', 'أسنان'], ['عيادة الأسنان 2', 'جدة', 'أسنان'], ['عيادة الجلدية 1', 'الرياض', 'جلدية'],
      ['Sterilization', 'الرياض', 'تعقيم'], ['Sterilization', 'جدة', 'تعقيم'] // نفس القسم في فرعين
    ]);
    gas.seed('Doctors', ['DoctorName', 'Clinic', 'NurseName', 'Subspecialty'], [
      ['د. خالد', 'عيادة الأسنان 1', 'سارة', 'تقويم'],
      ['د. نورة', 'عيادة الأسنان 1', 'سارة', ''],      // بدون حساب — يمكن الإرسال بدون مراجعة
      ['د. فهد', 'عيادة الجلدية 1', 'سارة', 'ليزر'],
      ['د. سعد', 'عيادة الأسنان 2', 'ريم', '']
    ]);
    gas.seed('Labs', ['LabName', 'Type', 'Email', 'Phone', 'Active'], [
      ['المعمل الداخلي', 'داخلي', 'lab@example.com', '', 'نعم'],
      ['معمل النخبة', 'خارجي', 'elite@example.com', '0500000000', 'نعم'],
      ['معمل الابتسامة', 'خارجي', '', '', 'نعم'],
      ['معمل موقوف', 'خارجي', '', '', 'لا']
    ]);
    gas.seed('ItemsCatalog', ['ItemName', 'CommercialName', 'Category', 'Price', 'Ownership', 'Serialized'], [
      ['MICRO BRUSH FINE', 'TPC Micro', 'Consumables', 45],
      ['PROPHY PASTE', 'Nupro', 'Hygiene', 60],
      ['DENTAL FLOSS', 'Oral-B', 'Hygiene', 12.5],
      ['Etchant Blue Tip', '3M Scotchbond', 'Bonding', 38],
      ['Ivoclar Tetric-N A2', 'Tetric N-Ceram', 'Composite', 120],
      ['Itero Sleeve', 'Align', 'Scanner', 300],
      ['قفازات طبية M', 'Sri Trang', 'Protection', 25],
      // عهدة (على حساب الشركة)
      ['Handpiece Low Speed', 'NSK', 'Handpiece', 1500, 'عهدة', 'نعم'],
      ['Curing Light', 'Woodpecker', 'Equipment', 800, 'عهدة', '']
    ]);
    return gas;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { seedFixtures };
  else root.seedFixtures = seedFixtures;
})(typeof window !== 'undefined' ? window : globalThis);
