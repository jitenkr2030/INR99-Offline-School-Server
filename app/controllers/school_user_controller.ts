import type { HttpContext } from '@adonisjs/core/http'
import SchoolUser from '#models/school_user'
import UserSession from '#models/user_session'
import StudentProgress from '#models/student_progress'
import { v4 as uuidv4 } from 'uuid'

export default class SchoolUserController {
  /**
   * Display login page
   */
  async login({ view }: HttpContext) {
    return view.render('pages/auth/login')
  }

  /**
   * Handle user login
   */
  async authenticate({ request, response, session }: HttpContext) {
    const { email, password, deviceInfo } = request.only(['email', 'password', 'deviceInfo'])
    const ipAddress = request.ip()

    try {
      // Find user by email
      const user = await SchoolUser.query()
        .where('email', email)
        .where('is_active', true)
        .first()

      if (!user) {
        session.flash('error', 'Invalid email or password')
        return response.redirect().back()
      }

      // For demo purposes, we'll use simple password comparison
      // In production, use proper password hashing
      if (user.password !== password) {
        session.flash('error', 'Invalid email or password')
        return response.redirect().back()
      }

      // Create user session
      const sessionId = uuidv4()
      const userSession = new UserSession()
      userSession.sessionId = sessionId
      userSession.userId = user.id
      userSession.deviceInfo = deviceInfo || 'Unknown device'
      userSession.ipAddress = ipAddress
      userSession.loginTime = new Date()
      await userSession.save()

      // Update user last login
      user.lastLogin = new Date()
      user.loginToken = sessionId
      await user.save()

      // Store session in browser session
      session.put('userSessionId', sessionId)
      session.put('userId', user.id)
      session.put('userRole', user.role)

      // Redirect based on user role
      if (user.role === 'admin') {
        return response.redirect('/admin/dashboard')
      } else if (user.role === 'teacher') {
        return response.redirect('/teacher/dashboard')
      } else {
        return response.redirect('/student/dashboard')
      }

    } catch (error) {
      session.flash('error', 'Login failed. Please try again.')
      return response.redirect().back()
    }
  }

  /**
   * Handle user logout
   */
  async logout({ response, session }: HttpContext) {
    const sessionId = session.get('userSessionId')
    
    if (sessionId) {
      const userSession = await UserSession.findBy('sessionId', sessionId)
      if (userSession) {
        userSession.logoutTime = new Date()
        userSession.durationMinutes = userSession.getDuration()
        await userSession.save()
      }
    }

    session.clear()
    return response.redirect('/login')
  }

  /**
   * Display user management dashboard (admin only)
   */
  async dashboard({ view, session }: HttpContext) {
    const userRole = session.get('userRole')
    
    if (userRole !== 'admin') {
      return response.redirect('/login')
    }

    // Get statistics
    const totalUsers = await SchoolUser.query().count('* as total')
    const activeUsers = await SchoolUser.query().where('is_active', true).count('* as total')
    const totalTeachers = await SchoolUser.query().where('role', 'teacher').count('* as total')
    const totalStudents = await SchoolUser.query().where('role', 'student').count('* as total')
    
    // Get recent sessions
    const recentSessions = await UserSession.query()
      .preload('user')
      .orderBy('loginTime', 'desc')
      .limit(10)

    return view.render('pages/admin/dashboard', {
      stats: {
        totalUsers: totalUsers[0]?.$extras.total || 0,
        activeUsers: activeUsers[0]?.$extras.total || 0,
        totalTeachers: totalTeachers[0]?.$extras.total || 0,
        totalStudents: totalStudents[0]?.$extras.total || 0,
      },
      recentSessions,
    })
  }

  /**
   * Display list of users (admin only)
   */
  async index({ view, request, session }: HttpContext) {
    const userRole = session.get('userRole')
    
    if (userRole !== 'admin') {
      return response.redirect('/login')
    }

    const page = request.input('page', 1)
    const limit = request.input('limit', 20)
    const role = request.input('role')
    const grade = request.input('grade')

    const query = SchoolUser.query().preload('sessions').preload('progress')

    if (role) {
      query.where('role', role)
    }

    if (grade) {
      query.where('gradeLevel', grade)
    }

    const users = await query.paginate(page, limit)

    return view.render('pages/admin/users/index', {
      users,
      filters: { role, grade },
    })
  }

  /**
   * Display create user form (admin only)
   */
  async create({ view }: HttpContext) {
    return view.render('pages/admin/users/create')
  }

  /**
   * Store new user (admin only)
   */
  async store({ request, response, session }: HttpContext) {
    const data = request.only([
      'userId', 'name', 'email', 'password', 'role', 'gradeLevel', 
      'section', 'subject', 'classTeacher', 'subjects', 'rollNumber',
      'parentName', 'parentContact', 'parentEmail'
    ])

    try {
      const user = new SchoolUser()
      user.fill(data)
      await user.save()

      session.flash('success', 'User created successfully')
      return response.redirect('/admin/users')
    } catch (error) {
      session.flash('error', 'Failed to create user')
      return response.redirect().back()
    }
  }

  /**
   * Display teacher dashboard
   */
  async teacherDashboard({ view, session }: HttpContext) {
    const userId = session.get('userId')
    const userRole = session.get('userRole')
    
    if (userRole !== 'teacher') {
      return response.redirect('/login')
    }

    const teacher = await SchoolUser.find(userId)
    if (!teacher) {
      return response.redirect('/login')
    }

    // Get teacher's students
    const students = await SchoolUser.query()
      .where('classTeacher', teacher.name)
      .where('role', 'student')
      .preload('progress')

    // Get progress summary
    const totalStudents = students.length
    const activeStudents = students.filter(s => s.progress?.length > 0).length

    return view.render('pages/teacher/dashboard', {
      teacher,
      students,
      stats: {
        totalStudents,
        activeStudents,
      },
    })
  }

  /**
   * Display student dashboard
   */
  async studentDashboard({ view, session }: HttpContext) {
    const userId = session.get('userId')
    const userRole = session.get('userRole')
    
    if (userRole !== 'student') {
      return response.redirect('/login')
    }

    const student = await SchoolUser.find(userId)
    if (!student) {
      return response.redirect('/login')
    }

    // Get student's progress
    const progress = await StudentProgress.query()
      .where('studentId', student.id)
      .orderBy('updatedAt', 'desc')

    // Calculate completion stats
    const totalSubjects = new Set(progress.map(p => p.subject)).size
    const completedSubjects = new Set(progress.filter(p => p.status === 'completed').map(p => p.subject)).size
    const averageProgress = progress.length > 0 
      ? progress.reduce((sum, p) => sum + p.progressPercentage, 0) / progress.length 
      : 0

    return view.render('pages/student/dashboard', {
      student,
      progress,
      stats: {
        totalSubjects,
        completedSubjects,
        averageProgress: Math.round(averageProgress),
        totalActivities: progress.length,
        completedActivities: progress.filter(p => p.status === 'completed').length,
      },
    })
  }

  /**
   * Track user activity
   */
  async trackActivity({ request, session }: HttpContext) {
    const sessionId = session.get('userSessionId')
    const { page, feature, action } = request.only(['page', 'feature', 'action'])

    if (sessionId) {
      const userSession = await UserSession.findBy('sessionId', sessionId)
      if (userSession) {
        if (page) userSession.addPageVisit(page)
        if (feature) userSession.addFeatureUsed(feature)
        if (action === 'ai_query') userSession.aiQueriesCount += 1
        if (action === 'download') userSession.downloadsCount += 1
        await userSession.save()
      }
    }

    return { success: true }
  }
}