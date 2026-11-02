-- =====================================================================
-- Seed data – safe to run more than once (ON CONFLICT DO NOTHING).
-- The initial Super Admin is NOT created here: run `npm run setup:admin`,
-- which reads credentials from environment variables.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------
INSERT INTO roles (name, display_name, description) VALUES
  ('super_admin', 'Super Admin',            'Full system access, approvals and user management'),
  ('inspector',   'Inspector / Technician', 'Inspects and maintains equipment in assigned wards'),
  ('ward_user',   'Ward Office User',       'Views equipment and reports faults for one ward')
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------
-- 11 ward offices (details to be completed by the Super Admin)
-- ---------------------------------------------------------------------
INSERT INTO wards (ward_number, office_name, address)
SELECT n,
       'Ward No. ' || n || ' Office',
       'Sainamaina-' || n || ', Rupandehi, Lumbini Province'
FROM generate_series(1, 11) AS n
ON CONFLICT (ward_number) DO NOTHING;

-- ---------------------------------------------------------------------
-- Equipment categories (31), grouped A–G
-- ---------------------------------------------------------------------
INSERT INTO equipment_categories (code, name, group_name, type_options, checklist_group, sort_order) VALUES
  -- A. Computer and Office Equipment
  ('DESKTOP',      'Desktop Computer (CPU)',                   'Computer and Office Equipment', '{}',                        'computer',     1),
  ('MONITOR',      'Monitor',                                  'Computer and Office Equipment', '{LED,LCD}',                 'computer',     2),
  ('KEYBOARD',     'Keyboard',                                 'Computer and Office Equipment', '{Wired,Wireless}',          'computer',     3),
  ('MOUSE',        'Mouse',                                    'Computer and Office Equipment', '{Wired,Wireless}',          'computer',     4),
  ('LAPTOP',       'Laptop',                                   'Computer and Office Equipment', '{}',                        'computer',     5),
  ('PRINTER',      'Printer',                                  'Computer and Office Equipment', '{Laser,Inkjet,Multifunction}', 'printer',   6),
  ('SCANNER',      'Scanner',                                  'Computer and Office Equipment', '{Flatbed,"Sheet-fed"}',     'printer',      7),
  -- B. Attendance Management
  ('BIO_FINGER',   'Biometric Fingerprint Attendance Device',  'Attendance Management',         '{}',                        'biometric',    8),
  ('BIO_FACE',     'Face Recognition Attendance Device',       'Attendance Management',         '{}',                        'biometric',    9),
  -- C. CCTV Surveillance
  ('CCTV_CAM',     'CCTV Camera',                              'CCTV Surveillance',             '{IP,Analog}',               'cctv',        10),
  ('DVR',          'DVR',                                      'CCTV Surveillance',             '{}',                        'cctv',        11),
  ('NVR',          'NVR',                                      'CCTV Surveillance',             '{}',                        'cctv',        12),
  ('CCTV_HDD',     'CCTV Hard Disk',                           'CCTV Surveillance',             '{}',                        'cctv',        13),
  ('CCTV_PWR',     'CCTV Power Supply / Accessories',          'CCTV Surveillance',             '{}',                        'cctv',        14),
  -- D. Networking and Internet
  ('FIREWALL',     'Firewall',                                 'Networking and Internet',       '{}',                        'networking',  15),
  ('ROUTER',       'Router',                                   'Networking and Internet',       '{}',                        'networking',  16),
  ('SWITCH',       'Network Switch',                           'Networking and Internet',       '{Managed,Unmanaged}',       'networking',  17),
  ('WIFI_AP',      'Wi-Fi Access Point',                       'Networking and Internet',       '{}',                        'networking',  18),
  ('RACK',         'Network Rack',                             'Networking and Internet',       '{"Wall-mount","Floor-standing"}', 'networking', 19),
  ('PATCH_PANEL',  'Patch Panel',                              'Networking and Internet',       '{}',                        'networking',  20),
  ('PATCH_CORD',   'Patch Cord',                               'Networking and Internet',       '{}',                        'networking',  21),
  ('LAN_CABLE',    'LAN Cable / Networking Cable',             'Networking and Internet',       '{Cat5e,Cat6,Cat6A}',        'networking',  22),
  ('RJ45',         'RJ45 Connector and Accessories',           'Networking and Internet',       '{}',                        'networking',  23),
  -- E. Power Backup
  ('UPS',          'UPS',                                      'Power Backup',                  '{Online,"Line-interactive",Offline}', 'ups', 24),
  ('UPS_BATTERY',  'UPS Battery',                              'Power Backup',                  '{}',                        'ups',         25),
  ('POWER_ACC',    'Power Distribution Accessories',           'Power Backup',                  '{}',                        NULL,          26),
  -- F. Presentation Equipment
  ('SMART_BOARD',  'Smart Board / Interactive Display',        'Presentation Equipment',        '{}',                        'presentation',27),
  ('PROJECTOR',    'Projector',                                'Presentation Equipment',        '{}',                        'presentation',28),
  ('SPEAKER',      'Speaker',                                  'Presentation Equipment',        '{}',                        'presentation',29),
  ('MICROPHONE',   'Microphone',                               'Presentation Equipment',        '{Wired,Wireless}',          'presentation',30),
  -- G. Other
  ('OTHER',        'Other ICT Devices and Accessories',        'Other ICT Equipment',           '{}',                        NULL,          31)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- Technical inspection checklist items
-- ---------------------------------------------------------------------
INSERT INTO inspection_checklist_items (checklist_group, label, sort_order) VALUES
  ('computer','Power On / Boot',1), ('computer','Monitor / Display',2), ('computer','Keyboard / Mouse',3),
  ('computer','RAM / Storage Condition',4), ('computer','Operating System',5), ('computer','Software',6),
  ('computer','Internet Connectivity',7), ('computer','USB Ports',8), ('computer','Physical Damage',9),

  ('printer','Power On / Off',1), ('printer','Printing Function',2), ('printer','Scanning Function',3),
  ('printer','Paper Feed',4), ('printer','Ink / Toner',5), ('printer','Connectivity',6),
  ('printer','Physical Condition',7),

  ('biometric','Power On / Off',1), ('biometric','Fingerprint / Face Recognition',2),
  ('biometric','User Authentication',3), ('biometric','Network Connectivity',4),
  ('biometric','Software Synchronization',5), ('biometric','Physical Condition',6),

  ('cctv','Camera Display',1), ('cctv','Video Recording',2), ('cctv','DVR / NVR Function',3),
  ('cctv','Hard Disk Status',4), ('cctv','Night Vision',5), ('cctv','Network Connectivity',6),
  ('cctv','Power Supply',7), ('cctv','Physical Condition',8),

  ('networking','Router Function',1), ('networking','Switch Port Status',2),
  ('networking','Internet Connectivity',3), ('networking','Wi-Fi Connectivity',4),
  ('networking','LAN Cable Connectivity',5), ('networking','Patch Panel Condition',6),
  ('networking','Rack Condition',7), ('networking','Firewall Status',8), ('networking','Cable Management',9),

  ('ups','Power On / Off',1), ('ups','Battery Backup',2), ('ups','Charging Status',3),
  ('ups','Output Voltage',4), ('ups','Battery Condition',5),

  ('presentation','Display / Screen',1), ('presentation','Touch Function',2),
  ('presentation','Power On / Off',3), ('presentation','Wi-Fi / Network',4), ('presentation','Speaker',5),
  ('presentation','Software',6), ('presentation','Accessories',7), ('presentation','Physical Condition',8)
ON CONFLICT (checklist_group, label) DO NOTHING;

-- ---------------------------------------------------------------------
-- System settings
-- ---------------------------------------------------------------------
INSERT INTO system_settings (key, value, description) VALUES
  ('municipality_name',    'Sainamaina Municipality',                       'Shown on reports'),
  ('office_name',          'Municipal Executive Office',                    'Shown on reports'),
  ('municipality_address', 'Buddhanagar, Rupandehi, Lumbini Province, Nepal','Shown on reports'),
  ('currency',             'NPR',                                           'Currency for cost fields'),
  ('max_photos_per_inspection', '10',                                       'Upload limit per inspection')
ON CONFLICT (key) DO NOTHING;

COMMIT;
