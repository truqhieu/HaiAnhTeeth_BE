const User = require('../models/user.model');
const Doctor = require('../models/doctor.model');
const Staff = require('../models/staff.model');
const Patient = require('../models/patient.model');

const ROLE_ACCOUNT = ['Doctor', 'Nurse', 'Staff', 'Manager'];

class AdminService {

  /**
   * Tạo account mới
   */
  async createAccount(data) {
    const { fullName, email, passwordHash, dob, role, phoneNumber, address, specialization, yearsOfExperience } = data;

    // Validate fullName
    if (!fullName || typeof fullName !== 'string' || fullName.trim().length === 0) {
      throw new Error('Họ tên không được để trống');
    }

    const cleanFullName = fullName.trim();

    if (cleanFullName.length === 0) {
      throw new Error("Họ và tên không được để trống");
    }

    if (!/^[\p{L}\s]+$/u.test(cleanFullName)) {
      throw new Error('Họ tên không được chứa số hoặc ký tự đặc biệt');
    }

    if (cleanFullName.length < 2) {
      throw new Error('Độ dài họ và tên không hợp lệ (tối thiểu 2 ký tự)');
    }

    // Validate email
    if (!email || typeof email !== 'string' || email.trim().length === 0) {
      throw new Error('Email không được để trống');
    }

    const cleanEmail = email.trim();

    if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(cleanEmail)) {
      throw new Error('Email không đúng định dạng');
    }

    const checkEmail = await User.findOne({ email });
    if (checkEmail) {
      throw new Error('Email đã tồn tại!');
    }

    // Validate password
    if (!passwordHash || typeof passwordHash !== 'string' || passwordHash.trim().length === 0) {
      throw new Error('Mật khẩu không được để trống');
    }

    const cleanPassword = passwordHash.trim();

    if (!/^(?=.*[A-Z])(?=(?:.*\d){2,})(?=.*[!@#$%^&*()_+{}\[\]:;"'<>,.?/~`-]).+$/.test(cleanPassword)) {
      throw new Error('Mật khẩu phải chứa ít nhất 1 chữ hoa, 2 chữ số và 1 kí tự đặc biệt');
    }

    if (cleanPassword.length < 4) {
      throw new Error('Độ dài mật khẩu không hợp lệ (tối thiểu 4 ký tự)');
    }

    // Validate dob
    if (!dob || typeof dob !== 'string' || dob.trim().length === 0) {
      throw new Error('Ngày sinh không được để trống');
    }

    const birthDate = new Date(dob);
    const now = new Date();

    if (isNaN(birthDate.getTime())) {
      throw new Error('Ngày sinh không hợp lệ');
    }

    let age = now.getFullYear() - birthDate.getFullYear();
    const month = now.getMonth() - birthDate.getMonth();
    const day = now.getDate() - birthDate.getDate();

    if (month < 0 || (month === 0 && day < 0)) {
      age--;
    }

    // if (age < 18) {
    //   throw new Error('Người dùng phải đủ 18 tuổi trở lên');
    // }

    // Validate role
    if (!role || !ROLE_ACCOUNT.includes(role)) {
      throw new Error('Vai trò không hợp lệ');
    }

    // Validate phoneNumber
    if (!phoneNumber || typeof phoneNumber !== 'string' || phoneNumber.trim().length === 0) {
      throw new Error('Số điện thoại không được để trống');
    }

    const cleanPhone = phoneNumber.trim();

    if (!/^[0-9]+$/.test(cleanPhone)) {
      throw new Error('Số điện thoại chỉ được chứa chữ số');
    }

    if (!cleanPhone.startsWith('0')) {
      throw new Error('Số điện thoại phải bắt đầu bằng số 0');
    }

    if (cleanPhone.length !== 10) {
      throw new Error('Số điện thoại phải có đủ 10 số');
    }

    // Validate address
    if (!address || typeof address !== 'string' || address.trim().length === 0) {
      throw new Error('Địa chỉ không được để trống');
    }

    const cleanAddress = address.trim();

    if (!/^[a-zA-ZÀ-ỹ0-9\s,.\-\/]+$/.test(cleanAddress)) {
      throw new Error('Địa chỉ không hợp lệ');
    }

    if (cleanAddress.length < 2) {
      throw new Error('Độ dài địa chỉ không hợp lệ (tối thiểu 2 ký tự)');
    }

    // Tạo User account
    const newAccount = new User({ fullName, email, passwordHash, dob, address, role, phoneNumber, status: 'Active' });
    if(newAccount.role === 'Doctor' && age <= 27) throw new Error('Bác sĩ phải đủ 27 tuổi')
    if(newAccount.role === 'Nurse' && age <= 22) throw new Error('Điều dưỡng phải đủ 22 tuổi')
    if(newAccount.role === 'Staff' && age <= 18) throw new Error('Lễ tân phải đủ 18 tuổi')
    await newAccount.save();

    // Nếu role là Doctor, tạo record trong Doctor collection
    if (role === 'Doctor') {
      const newDoctor = new Doctor({
        doctorUserId: newAccount._id,
        specialization: specialization || null,
        yearsOfExperience: yearsOfExperience || 0,
        status: 'Available'
      });
      await newDoctor.save();
      console.log(`✅ Tạo Doctor record thành công cho user: ${newAccount._id}`);
    }

    // Nếu role là Nurse, tạo record trong Nurse collection
    if (role === 'Nurse') {
      // TODO: Implement if Nurse model exists
    }

    // Nếu role là Staff, tạo record trong Staff collection
    if (role === 'Staff') {
      const newStaff = new Staff({
        userId: newAccount._id,
        status: 'Active'
      });
      await newStaff.save();
      console.log(`✅ Tạo Staff record thành công cho user: ${newAccount._id}`);
    }

    // Nếu role là Patient, tạo record trong Patient collection
    if (role === 'Patient') {
      const newPatient = new Patient({
        patientUserId: newAccount._id,
        emergencyContact: {
          name: '',
          phone: '',
          relationship: 'Other'
        }
      });
      await newPatient.save();
      console.log(`✅ Tạo Patient record thành công cho user: ${newAccount._id}`);
    }

    return {
      userId: newAccount._id,
      email: newAccount.email,
      fullName: newAccount.fullName,
      phoneNumber: newAccount.phoneNumber,
      dob: newAccount.dob,
      address: newAccount.address,
      role: newAccount.role
    };
  }

  /**
   * Lấy danh sách accounts
   */
  async getAllAccounts(filters = {}) {
    const {
      page = 1,
      limit = 10,
      status,
      search,
      gender,
      role,
      startDate,
      endDate,
      sort = 'desc'
    } = filters;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, parseInt(limit, 10) || 10);
    const skip = (pageNum - 1) * limitNum;

    const filter = {};
    if (status) filter.status = status;
    if (gender) filter.gender = gender;

    if (role) {
      filter.role = role;
    } else {
      filter.role = { $ne: 'Admin' };
    }

    if (search && String(search).trim().length > 0) {
      const searchKey = String(search).trim();
      const safe = searchKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regax = new RegExp(safe, 'i');
      filter.$or = [
        { fullName: { $regex: regax } },
        { email: { $regex: regax } },
        { phoneNumber: { $regex: regax } },
      ];
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 9999);
        filter.createdAt.$lte = end;
      }
    }

    const sortOrder = sort === 'asc' ? 1 : -1;

    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .select('-passwordHash -resetPasswordToken -resetPasswordExpire -__v')
        .sort({ createdAt: sortOrder })
        .skip(skip)
        .limit(limitNum)
        .lean()
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limitNum));

    return {
      total,
      totalPages,
      page: pageNum,
      limit: limitNum,
      data: users
    };
  }

  /**
   * Lấy chi tiết account
   */
  async getAccountById(id) {
    const detailAccount = await User.findById(id)
      .select('-passwordHash -resetPasswordToken -resetPasswordExpire -__v');
    
    if (!detailAccount) {
      throw new Error('Không tìm thấy tài khoản');
    }
    
    return detailAccount;
  }

  /**
   * Cập nhật account
   */
  async updateAccount(id, data) {
    const checkUser = await User.findById(id);
    if (!checkUser) {
      throw new Error('Không tìm thấy tài khoản');
    }

    if (checkUser.role === 'Patient') {
      throw new Error('Không thể cập nhật tài khoản bệnh nhân');
    }

    const updateFields = ['fullName', 'phoneNumber', 'address', 'dob', 'gender', 'status', 'email'];
    const updates = {};

    for (const key of Object.keys(data)) {
      if (!updateFields.includes(key)) continue;

      let value = data[key];

      // Validate fullName
      if (key === 'fullName') {
        const cleanFullName = value.trim();
        if (cleanFullName.length === 0) {
          throw new Error('Họ tên không được để trống');
        }
        if (!/^[a-zA-ZÀ-Ỹà-ỹĐđ\s]+$/.test(cleanFullName)) {
          throw new Error('Họ tên không được chứa số hoặc ký tự đặc biệt');
        }
        if (cleanFullName.length < 2) {
          throw new Error('Độ dài họ và tên không hợp lệ (tối thiểu 2 ký tự)');
        }
        updates[key] = cleanFullName;
      }

      // Validate phoneNumber
      if (key === 'phoneNumber') {
        const cleanPhone = value.trim();
        if (cleanPhone.length === 0) {
          updates[key] = null;
        } else {
          if (!/^[0-9]{10}$/.test(cleanPhone) || !cleanPhone.startsWith('0')) {
            throw new Error('Số điện thoại phải bắt đầu bằng 0 và có đúng 10 chữ số');
          }
          updates[key] = cleanPhone;
        }
      }

      // Validate address
      if (key === 'address') {
        const cleanAddress = value.trim();
        if (cleanAddress.length === 0) {
          updates[key] = null;
        } else {
          if (!/^[a-zA-ZÀ-Ỹà-ỹĐđ0-9\s,.\-\/]+$/.test(cleanAddress)) {
            throw new Error('Địa chỉ không hợp lệ');
          }
          if (cleanAddress.length < 2) {
            throw new Error('Độ dài địa chỉ không hợp lệ (tối thiểu 2 ký tự)');
          }
          updates[key] = cleanAddress;
        }
      }

      // Validate dob
      if (key === 'dob') {
        const birthDate = new Date(value);
        if (isNaN(birthDate.getTime())) {
          throw new Error('Ngày sinh không hợp lệ');
        }
        const now = new Date();
        let age = now.getFullYear() - birthDate.getFullYear();
        const m = now.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < birthDate.getDate())) age--;
        if (age < 18) {
          throw new Error('Người dùng phải đủ 18 tuổi trở lên');
        }
        updates[key] = value;
      }

      // Validate email
      if (key === 'email') {
        const email = value.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          throw new Error('Email không hợp lệ');
        }
        const taken = await User.findOne({ email, _id: { $ne: id } });
        if (taken) throw new Error('Email đã tồn tại');
        updates[key] = email;
      }

      // Gender & Status
      if (key === 'gender' || key === 'status') {
        updates[key] = value;
      }
    }

    if (Object.keys(updates).length === 0) {
      throw new Error('Không có trường hợp lệ để cập nhật');
    }

    const account = await User.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true })
      .select('-passwordHash');

    return account;
  }

  /**
   * Đổi password
   */
  async changePassword(id, password) {
    const checkUser = await User.findById(id);
    if (!checkUser) {
      throw new Error('Không tìm thấy người dùng');
    }

    if (checkUser.role === 'Patient') {
      throw new Error('Không thể thay đổi mật khẩu của bệnh nhân');
    }

    if (password) {
      if (typeof password !== 'string' || password.trim().length === 0) {
        throw new Error('Mật khẩu không được để trống');
      }

      const cleanPassword = password.trim();

      if (!/^(?=.*[A-Z])(?=(?:.*\d){2,})(?=.*[!@#$%^&*()_+{}\[\]:;"'<>,.?/~`-]).+$/.test(cleanPassword)) {
        throw new Error('Mật khẩu phải chứa ít nhất 1 chữ hoa, 2 số và 1 kí tự đặc biệt');
      }

      if (cleanPassword.length < 4) {
        throw new Error('Độ dài mật khẩu không hợp lệ (tối thiểu 4 ký tự)');
      }
    }

    checkUser.passwordHash = password;
    await checkUser.save();

    return true;
  }

  /**
   * Khóa accounts
   */
  async lockAccounts(selectedIds) {
    if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
      throw new Error('Vui lòng chọn ít nhất một tài khoản để khóa');
    }

    const result = await User.updateMany(
      { _id: { $in: selectedIds } },
      { $set: { status: 'Lock' } }
    );

    return result.modifiedCount;
  }

  /**
   * Mở khóa accounts
   */
  async unlockAccounts(selectedIds) {
    if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
      throw new Error('Vui lòng chọn ít nhất một tài khoản để mở khóa');
    }

    const result = await User.updateMany(
      { _id: { $in: selectedIds } },
      { $set: { status: 'Active' } }
    );

    return result.modifiedCount;
  }

  /**
   * Gán role (đổi giữa Doctor và Nurse)
   */
  async assignRole(id) {
    const user = await User.findById(id);
    if (!user) {
      throw new Error('Không tìm thấy người dùng');
    }

    if (user.role !== 'Doctor' && user.role !== 'Nurse') {
      throw new Error('Chỉ có thể thay đổi vai trò của bác sĩ hoặc y tá');
    }

    user.role = user.role === 'Doctor' ? 'Nurse' : 'Doctor';
    await user.save();

    if (user.role === 'Doctor') {
      const existingDoctor = await Doctor.findOne({ doctorUserId: id });
      if (!existingDoctor) {
        const newDoctor = new Doctor({
          doctorUserId: id,
          specialization: null,
          yearsOfExperience: 0,
        });
        await newDoctor.save();
      }
    }

    return true;
  }
}

module.exports = new AdminService();

