const MrVisit = require('../models/MrVisit');
const MrLeave = require('../models/MrLeave');
const { safeEscapeRegex } = require('../utils/whatsappService');

describe('MR Advanced Suite & Doctor Linking', () => {
  it('instantiates MrVisit schema with doctorId reference and doctorRefModel', () => {
    const visit = new MrVisit({
      mrId: '507f1f77bcf86cd799439011',
      date: new Date(),
      doctorId: '507f1f77bcf86cd799439022',
      doctorRefModel: 'Contact',
      doctorName: 'Dr. (Sharma) Clinic',
      clinicName: 'Sharma Health Care'
    });

    expect(visit.doctorId.toString()).toBe('507f1f77bcf86cd799439022');
    expect(visit.doctorRefModel).toBe('Contact');
    expect(visit.doctorName).toBe('Dr. (Sharma) Clinic');
  });

  it('safely escapes special characters in doctor names for regex matching', () => {
    const unescaped = 'Dr. (Sharma) & Co.*';
    const escaped = safeEscapeRegex(unescaped);

    expect(escaped).toBe('Dr\\. \\(Sharma\\) & Co\\.\\*');
    const regex = new RegExp(escaped, 'i');
    expect(regex.test('Dr. (Sharma) & Co.*')).toBe(true);
  });

  it('instantiates MrLeave schema correctly', () => {
    const leave = new MrLeave({
      mrId: '507f1f77bcf86cd799439011',
      startDate: new Date('2026-10-01'),
      endDate: new Date('2026-10-03'),
      leaveType: 'casual',
      reason: 'Family Event'
    });

    expect(leave.leaveType).toBe('casual');
    expect(leave.status).toBe('pending');
  });
});
