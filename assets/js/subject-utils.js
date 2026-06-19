/**
 * Subject fuzzy-matching utility.
 * Maps subject name variants (from sheet columns) to canonical names (teacher assignments).
 */
var SubjectUtils = {
  _variants: {
    'English': ['english', 'eng', 'com. english', 'com english', 'comenglish', 'communicative english', 'comp. english', 'comp english', 'compulsory english', 'ENGLISH'],
    'Nepali': ['nepali', 'nep', 'nep.', 'com. nepali', 'com nepali', 'comnepali', 'comp. nepali', 'comp nepali', 'compulsory nepali', 'NEPALI'],
    'Social': ['social', 'social studies', 'socialstudy', 'soc', 'soc. studies', 'soc studies', 's. studies', 'SOCIAL'],
    'BasicMath': ['basic math', 'basicmath', 'basic mathematics', 'b.math', 'b math', 'BASICMATH'],
    'Economics': ['economics', 'eco', 'econ', 'econs', 'ECONOMICS'],
    'Account': ['account', 'accounts', 'accountancy', 'acc', 'acct', 'ACCOUNT'],
    'BusinessStudies': ['business studies', 'businessstudies', 'bus. studies', 'bus studies', 'b. studies', 'bstudies', 'bs', 'b.studies', 'b studies', 'BUSINESSSTUDIES'],
    'ComputerScience': ['computer science', 'computer', 'cs', 'c. sc.', 'c sc', 'comp. sci', 'comp sci', 'compsci', 'csc', 'COMPUTERSCIENCE'],
    'HotelManagement': ['hotel management', 'hotelmanagement', 'hm', 'hotel mgmt', 'hotel', 'HOTELMANAGEMENT'],
    'BusinessMath': ['business math', 'businessmath', 'bm', 'bus. math', 'bus math', 'b.math', 'business mathematics', 'BUSINESSMATH']
  },

  normalize: function (str) {
    return String(str).trim().toLowerCase().replace(/\s+/g, ' ').replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
  },

  match: function (columnName) {
    var n = this.normalize(columnName);
    // Strip common TH/PR suffix before matching
    n = n.replace(/\s*(th|pr)\s*$/, '').trim();
    for (var canon in this._variants) {
      if (this.normalize(canon) === n) return canon;
      var variants = this._variants[canon];
      for (var i = 0; i < variants.length; i++) {
        if (this.normalize(variants[i]) === n) return canon;
      }
    }
    return null;
  },

  getAll: function () {
    return Object.keys(this._variants);
  },

  autoAssign: function (sheetSubjects, teachers) {
    var matches = [];
    var subjectTeacherMap = {};
    teachers.forEach(function (t) {
      (t.assignedSubjects || []).forEach(function (a) {
        var subj = a.subject || '';
        if (!subj) return;
        var canon = SubjectUtils.match(subj);
        var key = canon || SubjectUtils.normalize(subj);
        if (!subjectTeacherMap[key]) subjectTeacherMap[key] = [];
        subjectTeacherMap[key].push({ uid: t.uid || t.id, fullName: t.fullName || t.email, subject: subj });
      });
    });

    sheetSubjects.forEach(function (ss) {
      var canon = SubjectUtils.match(ss);
      if (!canon) return;
      var key = canon;
      var teachersForSubject = subjectTeacherMap[key];
      if (!teachersForSubject || !teachersForSubject.length) {
        var directKey = SubjectUtils.normalize(ss);
        teachersForSubject = subjectTeacherMap[directKey];
      }
      if (teachersForSubject && teachersForSubject.length) {
        teachersForSubject.forEach(function (t) {
          matches.push({
            teacherId: t.uid,
            teacherName: t.fullName,
            teacherSubject: t.subject,
            sheetSubject: ss,
            sheetSubjectCanon: canon
          });
        });
      }
    });

    return matches;
  }
};
