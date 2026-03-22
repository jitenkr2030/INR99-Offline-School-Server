# INR99 Offline School Server - School Deployment Guide

This guide helps school administrators and IT staff successfully deploy INR99 Offline School Server in educational environments.

## Pre-Deployment Checklist

### Infrastructure Requirements
- [ ] **Hardware**: Computer meeting minimum specifications (see [Pricing Plans](/docs/pricing))
- [ ] **Space**: Secure, ventilated location for the server
- [ ] **Power**: Stable electrical supply with UPS backup recommended
- [ ] **Network**: Local network setup (WiFi or Ethernet) for student access
- [ ] **Internet**: Temporary connection during installation only

### Administrative Preparation
- [ ] **Budget Approval**: Confirm funding for chosen plan
- [ ] **Stakeholder Buy-In**: Teachers, parents, and school management support
- [ ] **Technical Contact**: Designate IT coordinator or technical contact person
- [ ] **Training Schedule**: Plan teacher training sessions
- [ ] **Implementation Timeline**: Set realistic deployment milestones

### Legal and Compliance
- [ ] **Data Privacy**: Ensure compliance with student data protection regulations
- [ ] **Software Licenses**: Review and accept all software licenses
- [ ] **Parental Consent**: Inform parents about digital learning implementation

## Installation Process

### Phase 1: Server Setup (Day 1)

#### 1. Hardware Preparation
```bash
# Update system packages
sudo apt-get update && sudo apt-get upgrade -y

# Install required dependencies
sudo apt-get install -y curl wget git
```

#### 2. Download and Install Offline School Server
```bash
# Download installation script
curl -fsSL https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/install/install_nomad.sh -o install_school_server.sh

# Run installation (requires sudo)
sudo bash install_school_server.sh
```

#### 3. Initial Configuration
- Access the server at `http://localhost:8080` or `http://SERVER_IP:8080`
- Run the "School Setup" wizard
- Choose appropriate content collections for your school level
- Set up administrator access

### Phase 2: Content Installation (Day 2)

#### 1. Select Content Collections
Based on your school level:
- **Primary Schools**: Primary School Collection (~15GB)
- **Secondary Schools**: Secondary School Collection (~35GB)
- **All Schools**: Teacher Resources Collection (~8GB)

#### 2. Download Content
- Use the "Install Learning Tools" interface
- Select collections based on available storage and curriculum needs
- Monitor download progress (may take several hours)

#### 3. Verify Installation
- Test access to digital library
- Verify AI teaching assistant functionality
- Check learning platform content

### Phase 3: Network Configuration (Day 3)

#### 1. Local Network Setup
```bash
# Configure static IP (recommended)
sudo nano /etc/netplan/01-netcfg.yaml

# Example configuration:
network:
  version: 2
  ethernets:
    eth0:
      dhcp4: no
      addresses: [192.168.1.100/24]
      gateway4: 192.168.1.1
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]
```

#### 2. WiFi Access Point (Optional)
```bash
# Install hostapd for WiFi hotspot
sudo apt-get install -y hostapd dnsmasq

# Configure WiFi access point
sudo nano /etc/hostapd/hostapd.conf
```

#### 3. Client Device Configuration
- Provide students with server IP address
- Configure browser shortcuts
- Test connectivity from multiple devices

## Teacher Training Program

### Session 1: Introduction (2 hours)
- Overview of Offline School Server
- Benefits for teaching and learning
- Basic navigation and interface familiarization
- Hands-on exploration

### Session 2: Content Integration (3 hours)
- Accessing digital library resources
- Using the AI teaching assistant
- Integrating content into lesson plans
- Practical exercises by subject

### Session 3: Advanced Features (2 hours)
- Knowledge base creation and management
- Student progress monitoring
- Technical troubleshooting basics
- Best practices sharing

### Session 4: Subject-Specific Applications (2 hours per subject group)
- Mathematics: Using interactive learning platforms
- Science: Virtual labs and simulations
- Languages: Digital reading and writing tools
- Social Studies: Maps and historical resources

## Student Orientation

### Primary School Students (30 minutes)
- Simple introduction to the learning interface
- Basic navigation skills
- Safety and appropriate usage guidelines
- Fun exploration activities

### Secondary School Students (45 minutes)
- Comprehensive feature overview
- Research skills using digital library
- AI assistant for homework help
- Responsible digital citizenship

## Ongoing Support and Maintenance

### Daily Tasks
- [ ] Check server status and connectivity
- [ ] Monitor user activity and performance
- [ ] Address immediate technical issues

### Weekly Tasks
- [ ] Review system logs for errors
- [ ] Update content if internet connection available
- [ ] Collect teacher and student feedback
- [ ] Perform system backup if critical data stored

### Monthly Tasks
- [ ] System performance optimization
- [ ] Security updates and patches
- [ ] Content collection updates
- [ ] Usage analytics review

### Annual Tasks
- [ ] Hardware assessment and upgrades
- [ ] License renewals and plan updates
- [ ] Comprehensive teacher refresher training
- [ ] Student usage and outcome analysis

## Troubleshooting Guide

### Common Issues and Solutions

#### Server Not Accessible
**Problem**: Cannot access server from client devices
**Solutions**:
1. Check server is powered on and connected to network
2. Verify IP address configuration
3. Test connectivity: `ping SERVER_IP`
4. Check firewall settings
5. Restart network services

#### Slow Performance
**Problem**: Server response is slow or unresponsive
**Solutions**:
1. Check system resources: `htop`
2. Clear browser cache on client devices
3. Restart server services
4. Check for storage space availability
5. Consider hardware upgrade if persistent

#### Content Not Loading
**Problem**: Digital library or learning platform not accessible
**Solutions**:
1. Verify content installation completed successfully
2. Check service status: `docker ps`
3. Restart specific services: `docker restart SERVICE_NAME`
4. Reinstall corrupted content packages

#### AI Assistant Not Working
**Problem**: AI teaching assistant not responding
**Solutions**:
1. Check Ollama service status
2. Verify AI model installation
3. Check available system memory
4. Restart AI services

### Emergency Procedures

#### Complete System Failure
1. **Immediate Action**: Switch to backup teaching methods
2. **Diagnosis**: Check power, network, and hardware status
3. **Recovery**: Reboot system, check logs, restore from backup if needed
4. **Communication**: Inform staff and students about downtime

#### Data Corruption
1. **Isolation**: Disconnect from network to prevent further damage
2. **Assessment**: Identify affected services and data
3. **Recovery**: Restore from recent backups
4. **Prevention**: Review and improve backup procedures

## Security Considerations

### Physical Security
- Server location should be locked and accessible only to authorized staff
- Consider environmental monitoring (temperature, humidity)
- Maintain equipment inventory and maintenance records

### Network Security
- Change default passwords immediately
- Use strong, unique passwords for administrative access
- Regularly update system and application software
- Monitor network access logs

### Content Security
- Verify age-appropriateness of all content
- Implement content filtering if necessary
- Regular review of AI assistant responses
- Student data privacy protection

## Success Metrics and Evaluation

### Technical Metrics
- **Uptime**: Target >95% availability during school hours
- **Response Time**: <3 seconds for content loading
- **User Capacity**: Support concurrent users as per plan
- **Storage Utilization**: Efficient use of available storage

### Educational Metrics
- **Teacher Adoption**: >80% of teachers using platform weekly
- **Student Engagement**: Regular usage by >70% of students
- **Learning Outcomes**: Measurable improvement in subject areas
- **Digital Literacy**: Improved student technology skills

### Satisfaction Metrics
- **Teacher Satisfaction**: >4/5 rating in surveys
- **Student Feedback**: Positive response to digital learning
- **Parent Approval**: Support for digital learning initiatives
- **Technical Support**: <24-hour resolution for issues

## Scaling and Expansion

### When to Upgrade
- Consistent performance issues with current plan
- Increased student enrollment
- Addition of new subjects or grade levels
- Advanced features requirements

### Expansion Options
- **Hardware Upgrade**: Better CPU, more RAM, additional storage
- **Plan Upgrade**: Move to next pricing tier for more features
- **Multi-Server Setup**: Separate servers for different functions
- **Mobile Access**: Add tablet or mobile device support

## Contact and Support

### Technical Support
- **Email**: support@projectnomad.us
- **Phone**: +91-XXX-XXXX-XXXX
- **Response Time**: Based on plan (24-48 hours)

### Training and Professional Development
- **Email**: training@projectnomad.us
- **On-site Training**: Available for Premium Plan schools
- **Online Webinars**: Monthly for all plans

### Sales and Inquiries
- **Email**: schools@projectnomad.us
- **Consultation**: Schedule free assessment call
- **Custom Solutions**: Available for large districts

---

## Deployment Timeline Template

| Week | Activities | Responsible Party |
|------|------------|-------------------|
| 1 | Infrastructure preparation, hardware setup | IT Coordinator |
| 2 | Server installation, basic configuration | IT Coordinator |
| 3 | Content download and installation | IT Coordinator |
| 4 | Network configuration, client setup | IT Coordinator |
| 5 | Teacher training - Session 1 & 2 | School Admin |
| 6 | Teacher training - Session 3 & 4 | School Admin |
| 7 | Student orientation, pilot testing | Teachers |
| 8 | Full deployment, monitoring | All Staff |
| 9 | First evaluation, adjustments | School Admin |
| 12 | Comprehensive review and planning | All Stakeholders |

Use this template to create a customized deployment timeline for your school's specific needs and constraints.