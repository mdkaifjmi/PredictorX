import sys
from app.main import SessionLocal, User, pwd_context

if len(sys.argv) < 3:
    print("Usage: python create_admin.py <email> <password> [name]")
    raise SystemExit(1)
email = sys.argv[1].strip().lower()
password = sys.argv[2]
name = sys.argv[3].strip() if len(sys.argv) > 3 else "PredictorX Admin"
if len(password) < 8:
    print("Password must be at least 8 characters")
    raise SystemExit(1)
s = SessionLocal()
try:
    user = s.query(User).filter(User.email == email).first()
    if user:
        user.role = "admin"
        user.status = "active"
        user.name = name
        user.password_hash = pwd_context.hash(password)
        print(f"Admin account updated: {email}")
    else:
        user = User(name=name, email=email, password_hash=pwd_context.hash(password), role="admin", status="active")
        s.add(user)
        print(f"Admin account created: {email}")
    s.commit()
finally:
    s.close()
