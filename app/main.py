import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, status, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
import json
import uuid
from pathlib import Path
import pandas as pd
import numpy as np
import joblib
import shap
from sqlalchemy import create_engine, String, ForeignKey, Text, inspect, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, Session, sessionmaker
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression, LinearRegression, Ridge
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor, GradientBoostingClassifier, GradientBoostingRegressor
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, mean_absolute_error, mean_squared_error, r2_score

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./predictorx.db")
SECRET_KEY = os.getenv("SECRET_KEY", "predictorx-dev-secret-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(30), default="user", server_default="user")
    status: Mapped[str] = mapped_column(String(30), default="active", server_default="active")
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))

class Dataset(Base):
    __tablename__ = "datasets"
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    stored_path: Mapped[str] = mapped_column(String(500))
    rows: Mapped[int] = mapped_column(default=0)
    columns: Mapped[int] = mapped_column(default=0)
    missing_values: Mapped[int] = mapped_column(default=0)
    size_bytes: Mapped[int] = mapped_column(default=0)
    analysis_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))

class ModelRun(Base):
    __tablename__ = "model_runs"
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id"), index=True)
    target: Mapped[str] = mapped_column(String(255))
    task_type: Mapped[str] = mapped_column(String(40))
    model_name: Mapped[str] = mapped_column(String(120))
    metrics_json: Mapped[str] = mapped_column(Text, default="{}")
    artifact_path: Mapped[str] = mapped_column(String(500))
    is_best: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))


class PredictionHistory(Base):
    __tablename__ = "prediction_history"
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    model_id: Mapped[int] = mapped_column(ForeignKey("model_runs.id"), index=True)
    dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id"), index=True)
    target: Mapped[str] = mapped_column(String(255))
    task_type: Mapped[str] = mapped_column(String(40))
    model_name: Mapped[str] = mapped_column(String(120))
    prediction_json: Mapped[str] = mapped_column(Text, default="{}")
    input_json: Mapped[str] = mapped_column(Text, default="{}")
    explanation_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))

Base.metadata.create_all(bind=engine)

def _ensure_user_columns():
    """Backward-compatible migration for Phase 2/10 SQLite or PostgreSQL databases."""
    inspector = inspect(engine)
    if not inspector.has_table("users"):
        return
    columns = {c["name"] for c in inspector.get_columns("users")}
    statements = []
    if "role" not in columns:
        statements.append("ALTER TABLE users ADD COLUMN role VARCHAR(30) NOT NULL DEFAULT 'user'")
    if "status" not in columns:
        statements.append("ALTER TABLE users ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'active'")
    if statements:
        with engine.begin() as conn:
            for stmt in statements:
                conn.execute(text(stmt))

_ensure_user_columns()

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_UPLOAD_BYTES = 15 * 1024 * 1024

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

app = FastAPI(title="PredictorX API", version="4.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):\d+$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SignupRequest(BaseModel):
    name: str
    email: EmailStr
    password: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()

def make_token(user_id: int):
    expires = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({"sub": str(user_id), "exp": expires}, SECRET_KEY, algorithm=ALGORITHM)

def user_payload(user: User):
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role, "status": user.status}

def current_user(token: str = Depends(oauth2_scheme), session: Session = Depends(db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
    except (JWTError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.status != "active":
        if user.status == "pending":
            raise HTTPException(status_code=403, detail="Your account is pending admin approval.")
        if user.status == "rejected":
            raise HTTPException(status_code=403, detail="Your account was rejected by an administrator.")
        raise HTTPException(status_code=403, detail="Your account is currently inactive. Contact an administrator.")
    return user

def require_admin(user: User = Depends(current_user)):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Administrator access required")
    return user

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "PredictorX API"}

@app.post("/api/auth/signup")
def signup(data: SignupRequest, session: Session = Depends(db)):
    email = data.email.lower()
    if len(data.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if session.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="An account with this email already exists")
    user = User(name=data.name.strip(), email=email, password_hash=pwd_context.hash(data.password), role="user", status="pending")
    session.add(user)
    session.commit()
    session.refresh(user)
    return {"status": "pending", "message": "Account created. Please wait for administrator approval before signing in.", "user": user_payload(user)}

@app.post("/api/auth/login")
def login(data: LoginRequest, session: Session = Depends(db)):
    user = session.query(User).filter(User.email == data.email.lower()).first()
    if not user or not pwd_context.verify(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    if user.status != "active":
        if user.status == "pending":
            raise HTTPException(status_code=403, detail="Your account is pending admin approval.")
        if user.status == "rejected":
            raise HTTPException(status_code=403, detail="Your account was rejected by an administrator.")
        raise HTTPException(status_code=403, detail="Your account is inactive. Contact an administrator.")
    return {"access_token": make_token(user.id), "token_type": "bearer", "user": user_payload(user)}

@app.get("/api/auth/me")
def me(user: User = Depends(current_user)):
    return user_payload(user)

@app.get("/api/admin/users")
def admin_list_users(admin: User = Depends(require_admin), session: Session = Depends(db)):
    users = session.query(User).order_by(User.created_at.desc()).all()
    return {"users": [{**user_payload(u), "created_at": u.created_at.isoformat()} for u in users]}

@app.patch("/api/admin/users/{user_id}/status")
def admin_update_user_status(user_id: int, data: dict, admin: User = Depends(require_admin), session: Session = Depends(db)):
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    new_status = str(data.get("status", "")).lower().strip()
    if new_status not in {"pending", "active", "rejected", "inactive"}:
        raise HTTPException(status_code=400, detail="Invalid status")
    if target.id == admin.id and new_status != "active":
        raise HTTPException(status_code=400, detail="You cannot deactivate or reject your own admin account")
    target.status = new_status
    session.commit()
    session.refresh(target)
    return {"message": f"User status changed to {new_status}", "user": {**user_payload(target), "created_at": target.created_at.isoformat()}}



def _read_csv_bytes(content: bytes):
    last_error = None
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            from io import BytesIO
            return pd.read_csv(BytesIO(content), encoding=encoding)
        except Exception as exc:
            last_error = exc
    raise HTTPException(status_code=400, detail=f"Unable to read this CSV file: {last_error}")

def _dataset_analysis(df: pd.DataFrame):
    rows, cols = df.shape
    missing_by_column = df.isna().sum()
    missing_total = int(missing_by_column.sum())
    numerical = df.select_dtypes(include="number").columns.tolist()
    categorical = [c for c in df.columns if c not in numerical]
    candidates = []
    for i, col in enumerate(df.columns):
        nunique = int(df[col].nunique(dropna=True))
        unique_ratio = (nunique / rows) if rows else 0
        if nunique > 1 and (nunique <= 20 or unique_ratio <= 0.05 or i == cols - 1):
            candidates.append({"name": col, "unique_values": nunique, "reason": "Low-cardinality / likely target" if nunique <= 20 else "Last column / target candidate"})
    return {
        "rows": rows, "columns": cols,
        "column_names": [str(c) for c in df.columns],
        "numerical_columns": numerical,
        "categorical_columns": categorical,
        "missing_total": missing_total,
        "missing_percentage": round((missing_total / (rows * cols) * 100), 2) if rows and cols else 0,
        "missing_by_column": {str(k): int(v) for k, v in missing_by_column.items() if int(v) > 0},
        "target_candidates": candidates[:10],
        "duplicate_rows": int(df.duplicated().sum()),
        "memory_kb": round(df.memory_usage(deep=True).sum() / 1024, 1),
        "preview": json.loads(df.head(8).where(pd.notnull(df.head(8)), None).to_json(orient="records")),
    }

@app.post("/api/datasets/upload")
async def upload_dataset(file: UploadFile = File(...), user: User = Depends(current_user), session: Session = Depends(db)):
    filename = file.filename or "dataset.csv"
    if not filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="CSV must be 15 MB or smaller")
    df = _read_csv_bytes(content)
    if df.empty or len(df.columns) == 0:
        raise HTTPException(status_code=400, detail="CSV contains no usable rows or columns")
    analysis = _dataset_analysis(df)
    safe_name = f"{uuid.uuid4().hex}.csv"
    user_dir = UPLOAD_DIR / str(user.id)
    user_dir.mkdir(parents=True, exist_ok=True)
    path = user_dir / safe_name
    path.write_bytes(content)
    dataset = Dataset(user_id=user.id, name=filename, stored_path=str(path), rows=analysis["rows"], columns=analysis["columns"], missing_values=analysis["missing_total"], size_bytes=len(content), analysis_json=json.dumps(analysis))
    session.add(dataset)
    session.commit()
    session.refresh(dataset)
    return {"dataset": {"id": dataset.id, "name": dataset.name, "rows": dataset.rows, "columns": dataset.columns, "missing_values": dataset.missing_values, "size_bytes": dataset.size_bytes, "created_at": dataset.created_at.isoformat(), **analysis}}

@app.get("/api/datasets")
def list_datasets(user: User = Depends(current_user), session: Session = Depends(db)):
    rows = session.query(Dataset).filter(Dataset.user_id == user.id).order_by(Dataset.created_at.desc()).all()
    return {"datasets": [{"id": d.id, "name": d.name, "rows": d.rows, "columns": d.columns, "missing_values": d.missing_values, "size_bytes": d.size_bytes, "created_at": d.created_at.isoformat()} for d in rows]}

@app.get("/api/datasets/{dataset_id}")
def get_dataset(dataset_id: int, user: User = Depends(current_user), session: Session = Depends(db)):
    dataset = session.query(Dataset).filter(Dataset.id == dataset_id, Dataset.user_id == user.id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return {"dataset": {"id": dataset.id, "name": dataset.name, "rows": dataset.rows, "columns": dataset.columns, "missing_values": dataset.missing_values, "size_bytes": dataset.size_bytes, "created_at": dataset.created_at.isoformat(), **json.loads(dataset.analysis_json)}}


MODEL_DIR = Path(os.getenv("MODEL_DIR", "models"))
MODEL_DIR.mkdir(parents=True, exist_ok=True)


def _infer_task(df: pd.DataFrame, target: str):
    series = df[target].dropna()
    if not pd.api.types.is_numeric_dtype(series):
        return "classification"
    unique = series.nunique()
    if unique <= 10:
        return "classification"
    return "regression"


def _clean_target(df: pd.DataFrame, target: str, task: str):
    work = df.copy()
    work = work.dropna(subset=[target])
    if task == "classification":
        # Avoid numeric class labels being treated as continuous.
        work[target] = work[target].astype(str)
    else:
        work[target] = pd.to_numeric(work[target], errors="coerce")
        work = work.dropna(subset=[target])
    return work


def _make_preprocessor(X):
    numeric = X.select_dtypes(include="number").columns.tolist()
    categorical = [c for c in X.columns if c not in numeric]
    transformers = []
    if numeric:
        transformers.append(("num", Pipeline([("imputer", SimpleImputer(strategy="median")), ("scale", StandardScaler())]), numeric))
    if categorical:
        transformers.append(("cat", Pipeline([("imputer", SimpleImputer(strategy="most_frequent")), ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False))]), categorical))
    return ColumnTransformer(transformers=transformers, remainder="drop")


def _model_specs(task):
    if task == "classification":
        return [
            ("Logistic Regression", LogisticRegression(max_iter=1000)),
            ("Decision Tree", DecisionTreeClassifier(random_state=42, max_depth=8)),
            ("Random Forest", RandomForestClassifier(n_estimators=180, random_state=42, class_weight="balanced")),
            ("Gradient Boosting", GradientBoostingClassifier(random_state=42)),
        ]
    return [
        ("Linear Regression", LinearRegression()),
        ("Ridge Regression", Ridge(alpha=1.0)),
        ("Decision Tree", DecisionTreeRegressor(random_state=42, max_depth=8)),
        ("Random Forest", RandomForestRegressor(n_estimators=180, random_state=42)),
        ("Gradient Boosting", GradientBoostingRegressor(random_state=42)),
    ]


def _split_data(X, y, task):
    if len(X) < 8:
        return X, X, y, y
    test_size = 0.25 if len(X) >= 20 else 0.2
    stratify = None
    if task == "classification":
        counts = y.value_counts()
        if len(counts) >= 2 and counts.min() >= 2:
            stratify = y
    return train_test_split(X, y, test_size=test_size, random_state=42, stratify=stratify)


def _evaluate(model, X_test, y_test, task):
    pred = model.predict(X_test)
    if task == "classification":
        metrics = {
            "accuracy": round(float(accuracy_score(y_test, pred)), 4),
            "precision": round(float(precision_score(y_test, pred, average="weighted", zero_division=0)), 4),
            "recall": round(float(recall_score(y_test, pred, average="weighted", zero_division=0)), 4),
            "f1": round(float(f1_score(y_test, pred, average="weighted", zero_division=0)), 4),
        }
        try:
            if hasattr(model, "predict_proba") and len(np.unique(y_test)) == 2:
                probs = model.predict_proba(X_test)[:, 1]
                metrics["roc_auc"] = round(float(roc_auc_score(y_test, probs)), 4)
        except Exception:
            pass
        metrics["primary_metric"] = metrics["f1"]
        metrics["primary_label"] = "F1 Score"
        return metrics
    rmse = float(np.sqrt(mean_squared_error(y_test, pred)))
    metrics = {
        "mae": round(float(mean_absolute_error(y_test, pred)), 4),
        "rmse": round(rmse, 4),
        "r2": round(float(r2_score(y_test, pred)), 4),
        "primary_metric": round(float(r2_score(y_test, pred)), 4),
        "primary_label": "R² Score",
    }
    return metrics


@app.post("/api/models/train")
def train_models(dataset_id: int, target: str, task_type: Optional[str] = None, user: User = Depends(current_user), session: Session = Depends(db)):
    dataset = session.query(Dataset).filter(Dataset.id == dataset_id, Dataset.user_id == user.id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if not target:
        raise HTTPException(status_code=400, detail="Target column is required")
    try:
        df = pd.read_csv(dataset.stored_path, encoding="utf-8-sig")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Unable to load dataset: {exc}")
    if target not in df.columns:
        raise HTTPException(status_code=400, detail="Target column not found in dataset")
    task = task_type if task_type in ("classification", "regression") else _infer_task(df, target)
    work = _clean_target(df, target, task)
    if len(work) < 8:
        raise HTTPException(status_code=400, detail="At least 8 usable rows are required for AutoML")
    if work[target].nunique() < 2:
        raise HTTPException(status_code=400, detail="Target must contain at least 2 distinct values")
    if task == "classification" and work[target].nunique() > 20:
        raise HTTPException(status_code=400, detail="Classification target has too many classes; choose regression or another target")
    X = work.drop(columns=[target])
    y = work[target]
    if X.shape[1] == 0:
        raise HTTPException(status_code=400, detail="Dataset needs at least one feature besides the target")
    X_train, X_test, y_train, y_test = _split_data(X, y, task)
    results=[]
    failures=[]
    # Remove prior runs for this dataset/target so the page always reflects the latest training.
    session.query(ModelRun).filter(ModelRun.dataset_id == dataset.id, ModelRun.user_id == user.id, ModelRun.target == target).delete(synchronize_session=False)
    session.commit()
    for name, estimator in _model_specs(task):
        try:
            pipe = Pipeline([("preprocessor", _make_preprocessor(X_train)), ("model", estimator)])
            pipe.fit(X_train, y_train)
            metrics = _evaluate(pipe, X_test, y_test, task)
            artifact = MODEL_DIR / f"{uuid.uuid4().hex}.joblib"
            joblib.dump(pipe, artifact)
            run = ModelRun(user_id=user.id, dataset_id=dataset.id, target=target, task_type=task, model_name=name, metrics_json=json.dumps(metrics), artifact_path=str(artifact))
            session.add(run)
            session.flush()
            results.append((run, metrics))
        except Exception as exc:
            failures.append({"model": name, "error": str(exc)})
    if not results:
        raise HTTPException(status_code=400, detail="No suitable model could be trained. Check the target and data types.")
    if task == "classification":
        best = max(results, key=lambda x: x[1].get("f1", -1))
    else:
        best = max(results, key=lambda x: x[1].get("r2", -1e18))
    best[0].is_best = True
    session.commit()
    return {
        "training": {
            "dataset_id": dataset.id, "dataset_name": dataset.name, "target": target,
            "task_type": task, "rows_used": len(work), "features": X.columns.tolist(),
            "best_model": best[0].model_name, "trained_models": len(results), "failures": failures
        },
        "models": [
            {"id": r.id, "dataset_id": dataset.id, "dataset_name": dataset.name,
             "target": target, "task_type": task, "name": r.model_name,
             "metrics": m, "is_best": r.is_best, "created_at": r.created_at.isoformat()}
            for r,m in sorted(results, key=lambda x: x[1].get("primary_metric", 0), reverse=True)
        ]
    }


@app.get("/api/models")
def list_models(user: User = Depends(current_user), session: Session = Depends(db)):
    rows = session.query(ModelRun).filter(ModelRun.user_id == user.id).order_by(ModelRun.created_at.desc()).all()
    dataset_names = {d.id: d.name for d in session.query(Dataset).filter(Dataset.user_id == user.id).all()}
    return {"models": [{"id": r.id, "dataset_id": r.dataset_id, "dataset_name": dataset_names.get(r.dataset_id, f"Dataset #{r.dataset_id}"), "target": r.target, "task_type": r.task_type, "name": r.model_name, "metrics": json.loads(r.metrics_json), "is_best": r.is_best, "created_at": r.created_at.isoformat()} for r in rows]}


def _feature_actionability(name: str, series=None):
    """Return whether a feature is sensible for a user-controlled what-if scenario.

    This is intentionally conservative: identifiers, demographics/identity fields,
    dates of birth, and historical/past/outcome-like fields are shown for context but
    are not offered as controllable what-if levers.
    """
    lname = str(name).strip().lower().replace("-", "_").replace(" ", "_")
    compact = lname.replace("_", "")
    immutable_exact = {
        "id", "studentid", "userid", "user_id", "recordid", "record_id",
        "rowid", "row_id", "index", "name", "fullname", "full_name",
        "email", "phone", "dob", "dateofbirth", "date_of_birth",
        "birthdate", "birth_date", "gender", "sex",
    }
    if lname in immutable_exact or compact in {x.replace("_", "") for x in immutable_exact}:
        return False, "Identifier or personal-identity field"
    if lname.endswith("_id") or lname.endswith("id") or "identifier" in lname or "record_number" in lname:
        return False, "Identifier field"
    historical_tokens = (
        "previous", "prev_", "past", "prior", "historical", "history",
        "last_", "baseline", "old_", "former", "earlier", "prior_"
    )
    if any(tok in lname for tok in historical_tokens):
        return False, "Historical/past value"
    if any(tok in lname for tok in ("timestamp", "created_at", "updated_at", "date_of_birth", "birth_date", "dob")):
        return False, "System or birth-date field"
    if lname == "age" or lname.startswith("age_") or lname.endswith("_age"):
        return False, "Age is not a direct user-controlled lever"
    if "outcome" in lname or lname.endswith("_result") or lname.endswith("_score") and ("previous" in lname or "past" in lname or "prior" in lname):
        return False, "Outcome or historical value"
    # Explicitly recognize common real-world action/behavior measures. These
    # remain actionable even when every row has a different value.
    actionable_tokens = (
        "attendance", "completion", "study_hours", "hours_per_day",
        "practice", "exercise", "training", "bathroom", "bedroom",
        "garage", "pool", "neighborhood", "sqft", "square_feet",
        "internet_access", "access", "commute", "distance_to_center",
        "quality", "spending", "budget", "price", "income", "salary",
        "experience", "rating", "credit_limit", "utilization"
    )
    if any(token in lname for token in actionable_tokens):
        return True, "User-controllable feature"
    # Do not classify a feature as read-only merely because most rows have
    # different values. Continuous/actionable measurements such as
    # attendance_pct, assignment_completion_pct, sqft, etc. can naturally
    # have a high unique-value ratio. Read-only status is determined by
    # semantic field names above (identifier, historical, age, system fields).
    return True, "User-controllable feature"


@app.get("/api/models/{model_id}")
def get_model(model_id: int, user: User = Depends(current_user), session: Session = Depends(db)):
    run = session.query(ModelRun).filter(ModelRun.id == model_id, ModelRun.user_id == user.id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Model not found")
    dataset = session.query(Dataset).filter(Dataset.id == run.dataset_id, Dataset.user_id == user.id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    analysis = json.loads(dataset.analysis_json)
    features = [c for c in analysis.get("column_names", []) if c != run.target]
    numeric = set(analysis.get("numerical_columns", []))
    categorical = set(analysis.get("categorical_columns", []))
    feature_schema = []
    try:
        df = pd.read_csv(dataset.stored_path, encoding="utf-8-sig", nrows=1000)
    except Exception:
        df = pd.DataFrame()
    for name in features:
        actionable, action_reason = _feature_actionability(name, df[name] if not df.empty and name in df.columns else None)
        item = {"name": name, "type": "number" if name in numeric else "category", "required": False, "actionable": actionable, "actionable_reason": action_reason}
        if name in numeric and not df.empty and name in df.columns:
            series = pd.to_numeric(df[name], errors="coerce").dropna()
            if len(series):
                item.update({"min": float(series.min()), "max": float(series.max()), "median": float(series.median())})
        elif not df.empty and name in df.columns:
            values = df[name].dropna().astype(str).value_counts().head(30).index.tolist()
            item["options"] = values
        feature_schema.append(item)
    return {"model": {
        "id": run.id, "dataset_id": run.dataset_id, "dataset_name": dataset.name,
        "target": run.target, "task_type": run.task_type, "name": run.model_name,
        "metrics": json.loads(run.metrics_json), "is_best": run.is_best,
        "features": feature_schema
    }}


class PredictionRequest(BaseModel):
    features: dict
    baseline_features: dict = {}
    history_id: Optional[int] = None


def _feature_schema_for_dataset(dataset: Dataset, target: str):
    analysis = json.loads(dataset.analysis_json)
    feature_names = [c for c in analysis.get("column_names", []) if c != target]
    numeric = set(analysis.get("numerical_columns", []))
    return feature_names, numeric

def _aggregate_shap_values(raw_names, raw_values, original_features):
    # One-hot encoded categorical columns produce several SHAP values.
    # Aggregate them back to their original dataset feature for a user-friendly explanation.
    totals = {f: 0.0 for f in original_features}
    for name, value in zip(raw_names, raw_values):
        clean_name = str(name)
        matched = None
        for feature in original_features:
            if clean_name == feature or clean_name.endswith("__" + feature) or clean_name.endswith("_" + feature):
                matched = feature
                break
            if feature in clean_name:
                matched = feature
                break
        if matched is None:
            matched = clean_name
            totals.setdefault(matched, 0.0)
        totals[matched] += float(value)
    return totals

def _shap_explanation(run: ModelRun, dataset: Dataset, clean: dict):
    if not Path(run.artifact_path).exists():
        raise HTTPException(status_code=404, detail="Trained model artifact is missing. Retrain the model.")
    try:
        df = pd.read_csv(dataset.stored_path, encoding="utf-8-sig")
        work = _clean_target(df, run.target, run.task_type)
        X = work.drop(columns=[run.target])
        feature_names = X.columns.tolist()
        if X.empty or not feature_names:
            raise ValueError("No usable features available for explanation")
        model_pipe = joblib.load(run.artifact_path)
        preprocessor = model_pipe.named_steps["preprocessor"]
        estimator = model_pipe.named_steps["model"]
        transformed = preprocessor.transform(X)
        row = pd.DataFrame([clean], columns=feature_names)
        row_transformed = preprocessor.transform(row)
        transformed_names = list(preprocessor.get_feature_names_out())
        background = transformed[:min(100, len(transformed))]
        if run.task_type == "classification" and hasattr(estimator, "predict_proba"):
            explainer = shap.Explainer(estimator.predict_proba, background, feature_names=transformed_names)
            explanation = explainer(row_transformed)
            values = np.asarray(explanation.values)
            # For binary/multiclass models, explain the predicted class.
            pred_index = int(np.argmax(model_pipe.predict_proba(row)[0]))
            if values.ndim == 3:
                values = values[0, :, pred_index]
            elif values.ndim == 2:
                values = values[0]
            else:
                values = values.reshape(-1)
            base_values = np.asarray(explanation.base_values)
            if base_values.ndim >= 2:
                base_value = float(base_values[0, pred_index])
            elif base_values.ndim == 1:
                base_value = float(base_values[pred_index]) if len(base_values) > 1 else float(base_values[0])
            else:
                base_value = float(base_values.reshape(-1)[0])
            predicted_class = str(model_pipe.classes_[pred_index])
        else:
            explainer = shap.Explainer(estimator, background, feature_names=transformed_names)
            explanation = explainer(row_transformed)
            values = np.asarray(explanation.values).reshape(-1)
            base_values = np.asarray(explanation.base_values).reshape(-1)
            base_value = float(base_values[0]) if len(base_values) else 0.0
            predicted_class = None
        aggregated = _aggregate_shap_values(transformed_names, values, feature_names)
        rows = []
        for feature, contribution in aggregated.items():
            rows.append({"feature": feature, "contribution": round(float(contribution), 6), "direction": "increases" if contribution >= 0 else "decreases", "impact": round(abs(float(contribution)), 6)})
        rows.sort(key=lambda x: x["impact"], reverse=True)
        global_values = np.abs(np.asarray(explainer(background).values))
        if global_values.ndim == 3:
            global_values = global_values.mean(axis=2)
        if global_values.ndim == 2:
            global_values = global_values.mean(axis=0)
        global_agg = _aggregate_shap_values(transformed_names, global_values, feature_names)
        global_rows = [{"feature": f, "importance": round(float(v), 6)} for f,v in sorted(global_agg.items(), key=lambda x:x[1], reverse=True)]
        return {"base_value": round(base_value, 6), "predicted_class": predicted_class, "features": rows[:20], "global_importance": global_rows[:20], "method": "SHAP"}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"SHAP explanation failed: {exc}")

@app.post("/api/models/{model_id}/explain")
def explain_prediction(model_id: int, data: PredictionRequest, user: User = Depends(current_user), session: Session = Depends(db)):
    run = session.query(ModelRun).filter(ModelRun.id == model_id, ModelRun.user_id == user.id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Model not found")
    dataset = session.query(Dataset).filter(Dataset.id == run.dataset_id, Dataset.user_id == user.id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    feature_names, numeric = _feature_schema_for_dataset(dataset, run.target)
    schema = [{"name": n, "type": "number" if n in numeric else "category"} for n in feature_names]
    clean = _coerce_prediction_features(data.features or {}, schema)
    explanation = _shap_explanation(run, dataset, clean)
    if data.history_id is not None:
        history = session.query(PredictionHistory).filter(PredictionHistory.id == data.history_id, PredictionHistory.user_id == user.id, PredictionHistory.model_id == run.id).first()
        if history:
            history.explanation_json = json.dumps(explanation, default=str)
            session.commit()
    return {"model_id": run.id, "model_name": run.model_name, "dataset_name": dataset.name, "target": run.target, "task_type": run.task_type, "history_id": data.history_id, "explanation": explanation}


def _coerce_prediction_features(values: dict, schema):
    clean = {}
    for item in schema:
        name = item["name"]
        value = values.get(name)
        if value == "" or value is None:
            clean[name] = np.nan
        elif item["type"] == "number":
            try:
                clean[name] = float(value)
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail=f'Feature "{name}" must be numeric')
        else:
            clean[name] = str(value)
    return clean



@app.post("/api/models/{model_id}/what-if")
def what_if_prediction(model_id: int, data: PredictionRequest, user: User = Depends(current_user), session: Session = Depends(db)):
    """Run a real model inference for a what-if scenario and compare it with a baseline."""
    run = session.query(ModelRun).filter(ModelRun.id == model_id, ModelRun.user_id == user.id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Model not found")
    if not Path(run.artifact_path).exists():
        raise HTTPException(status_code=404, detail="Trained model artifact is missing. Retrain the model.")
    dataset = session.query(Dataset).filter(Dataset.id == run.dataset_id, Dataset.user_id == user.id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    feature_names, numeric = _feature_schema_for_dataset(dataset, run.target)
    schema = [{"name": n, "type": "number" if n in numeric else "category"} for n in feature_names]
    scenario = _coerce_prediction_features(data.features or {}, schema)
    baseline = _coerce_prediction_features(data.baseline_features or {}, schema)
    try:
        df = pd.read_csv(dataset.stored_path, encoding="utf-8-sig", nrows=1000)
    except Exception:
        df = pd.DataFrame()
    non_actionable = {
        n for n in feature_names
        if not _feature_actionability(n, df[n] if not df.empty and n in df.columns else None)[0]
    }
    attempted_changes = []
    for name in feature_names:
        before, after = baseline.get(name), scenario.get(name)
        same = (pd.isna(before) and pd.isna(after)) or before == after
        if not same and name in non_actionable:
            attempted_changes.append(name)
    if attempted_changes:
        raise HTTPException(status_code=400, detail="These fields are not user-controllable for What-if analysis: " + ", ".join(attempted_changes))

    scenario_df = pd.DataFrame([scenario], columns=feature_names)
    baseline_df = pd.DataFrame([baseline], columns=feature_names)

    try:
        model = joblib.load(run.artifact_path)
        scenario_pred = model.predict(scenario_df)[0]
        baseline_pred = model.predict(baseline_df)[0]

        result = {
            "model_id": run.id,
            "model_name": run.model_name,
            "target": run.target,
            "task_type": run.task_type,
            "baseline_prediction": scenario_pred.item() if hasattr(scenario_pred, "item") else scenario_pred,
            "scenario_prediction": scenario_pred.item() if hasattr(scenario_pred, "item") else scenario_pred,
            "changed_features": [],
        }

        # Re-run baseline correctly; scenario_pred above is intentionally retained for serialization.
        base_pred = model.predict(baseline_df)[0]
        result["baseline_prediction"] = base_pred.item() if hasattr(base_pred, "item") else base_pred
        result["scenario_prediction"] = scenario_pred.item() if hasattr(scenario_pred, "item") else scenario_pred

        if run.task_type == "classification" and hasattr(model, "predict_proba"):
            base_probs = model.predict_proba(baseline_df)[0]
            scenario_probs = model.predict_proba(scenario_df)[0]
            classes = list(model.classes_)
            result["classes"] = [c.item() if hasattr(c, "item") else c for c in classes]
            result["baseline_probabilities"] = [
                {"class": c.item() if hasattr(c, "item") else c, "probability": round(float(p), 6)}
                for c, p in zip(classes, base_probs)
            ]
            result["scenario_probabilities"] = [
                {"class": c.item() if hasattr(c, "item") else c, "probability": round(float(p), 6)}
                for c, p in zip(classes, scenario_probs)
            ]
            result["baseline_confidence"] = round(float(np.max(base_probs)), 6)
            result["scenario_confidence"] = round(float(np.max(scenario_probs)), 6)
            # Difference for the probability of the scenario's predicted class.
            scenario_class_idx = int(np.argmax(scenario_probs))
            result["change"] = round(float(scenario_probs[scenario_class_idx] - base_probs[scenario_class_idx]), 6)
            result["change_label"] = "percentage-point change in scenario predicted-class probability"
        else:
            base_value = float(base_pred)
            scenario_value = float(scenario_pred)
            result["change"] = round(scenario_value - base_value, 6)
            result["change_label"] = "change in predicted value"

        for name in feature_names:
            before = baseline.get(name)
            after = scenario.get(name)
            if (pd.isna(before) and pd.isna(after)) or before == after:
                continue
            result["changed_features"].append({
                "feature": name,
                "before": None if pd.isna(before) else (before.item() if hasattr(before, "item") else before),
                "after": None if pd.isna(after) else (after.item() if hasattr(after, "item") else after),
            })

        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"What-if prediction failed: {exc}")


@app.post("/api/models/{model_id}/recommend")
def recommend_counterfactuals(model_id: int, data: PredictionRequest, user: User = Depends(current_user), session: Session = Depends(db)):
    """Generate data/model-driven single-feature counterfactual recommendations.

    Numeric candidates come from observed dataset quantiles/min/max; categorical candidates
    come from values observed in the dataset. Identifier-like columns and constant columns are
    excluded so recommendations focus on actionable predictors rather than row identifiers.
    """
    run = session.query(ModelRun).filter(ModelRun.id == model_id, ModelRun.user_id == user.id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Model not found")
    if not Path(run.artifact_path).exists():
        raise HTTPException(status_code=404, detail="Trained model artifact is missing. Retrain the model.")
    dataset = session.query(Dataset).filter(Dataset.id == run.dataset_id, Dataset.user_id == user.id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    try:
        df = pd.read_csv(dataset.stored_path, encoding="utf-8-sig")
        analysis = json.loads(dataset.analysis_json)
        # Keep the COMPLETE model feature schema for inference.  The trained
        # pipeline may require read-only/context features (for example house_id,
        # sqft, age_years, etc.) even though those fields must never be changed
        # by the recommendation engine.  Only the separate actionable_names list
        # is used to generate candidate recommendations.
        feature_names = [c for c in analysis.get("column_names", []) if c != run.target and c in df.columns]
        numeric = set(analysis.get("numerical_columns", []))
        categorical = set(analysis.get("categorical_columns", []))
        actionable_names = [
            name for name in feature_names
            if _feature_actionability(name, df[name] if name in df.columns else None)[0]
        ]
        schema = [{"name": n, "type": "number" if n in numeric else "category"} for n in feature_names]
        current_features = _coerce_prediction_features(data.features or {}, schema)
        baseline = _coerce_prediction_features(data.baseline_features or {}, schema)
        if not baseline:
            baseline = dict(current_features)
        baseline_df = pd.DataFrame([baseline], columns=feature_names)
        current_df = pd.DataFrame([current_features], columns=feature_names)
        model = joblib.load(run.artifact_path)

        baseline_pred = model.predict(current_df)[0]
        baseline_pred_value = baseline_pred.item() if hasattr(baseline_pred, "item") else baseline_pred
        baseline_probs = None
        desired_class = None
        if run.task_type == "classification" and hasattr(model, "predict_proba"):
            probs = model.predict_proba(current_df)[0]
            classes = list(model.classes_)
            idx = int(np.argmax(probs))
            desired_class = data.baseline_features.get("desired_class") if isinstance(data.baseline_features, dict) else None
            if desired_class is None or str(desired_class) not in {str(c) for c in classes}:
                desired_class = classes[idx]
            desired_idx = next(i for i, c in enumerate(classes) if str(c) == str(desired_class))
            baseline_probs = {str(c): float(p) for c, p in zip(classes, probs)}
            baseline_score = float(probs[desired_idx])
        else:
            baseline_score = float(baseline_pred)

        applied_changes = []
        for name in actionable_names:
            actionable, _ = _feature_actionability(name, df[name] if name in df.columns else None)
            if not actionable or name not in data.baseline_features or name not in current_features:
                continue
            before = baseline.get(name)
            after = current_features.get(name)
            if str(before) == str(after):
                continue
            try:
                before_df = pd.DataFrame([{**current_features, name: before}], columns=feature_names)
                before_pred = model.predict(before_df)[0]
                after_pred = model.predict(current_df)[0]
                if run.task_type == "classification" and hasattr(model, "predict_proba"):
                    before_probs = model.predict_proba(before_df)[0]
                    after_probs = model.predict_proba(current_df)[0]
                    classes = list(model.classes_)
                    target_idx = int(np.argmax(after_probs))
                    improvement = float(after_probs[target_idx] - before_probs[target_idx])
                    applied_probability = float(after_probs[target_idx])
                else:
                    improvement = float(after_pred) - float(before_pred)
                    applied_probability = None
                applied_changes.append({
                    "feature": name, "from": before, "to": after,
                    "before_prediction": before_pred.item() if hasattr(before_pred, "item") else before_pred,
                    "after_prediction": after_pred.item() if hasattr(after_pred, "item") else after_pred,
                    "improvement": round(float(improvement), 6),
                    "probability": round(applied_probability, 6) if applied_probability is not None else None,
                })
            except Exception:
                continue

        # Keep the applied-change summary separate, but DO NOT exclude a feature
        # merely because the user already changed it.  The recommendation engine
        # should be able to say, for example, "study_hours_per_day 4 -> 5" after
        # the user has already tested "3 -> 4".  Recommendations are still limited
        # to actionable features only.
        candidates = []
        for name in actionable_names:
            series = df[name]
            actionable, _ = _feature_actionability(name, series)
            if not actionable:
                continue
            non_null = series.dropna()
            if non_null.empty or non_null.nunique() <= 1:
                continue
            # Exclude likely row identifiers / index-like fields from recommendations.
            unique_ratio = float(non_null.nunique()) / max(len(non_null), 1)
            lname = name.lower().replace(" ", "_")
            if unique_ratio >= 0.8 and (lname.endswith("id") or lname.endswith("_id") or "identifier" in lname or lname == "index"):
                continue

            values_to_try = []
            current = current_features.get(name)
            if name in numeric:
                nums = pd.to_numeric(non_null, errors="coerce").dropna()
                if nums.empty:
                    continue
                qs = [0.1, 0.25, 0.5, 0.75, 0.9]
                values_to_try = [float(nums.quantile(q)) for q in qs]
                values_to_try += [float(nums.min()), float(nums.max())]
                # Keep integer-valued dataset features practical (for example, age or counts).
                if bool(np.all(np.isclose(nums.to_numpy(), np.round(nums.to_numpy())))):
                    values_to_try = [float(round(v)) for v in values_to_try]
                current_num = float(current) if current is not None and not pd.isna(current) else float(nums.median())
                values_to_try = [v for v in values_to_try if np.isfinite(v) and abs(v-current_num) > 1e-12]
            else:
                observed = non_null.astype(str).value_counts().index.tolist()
                current_str = "" if current is None or pd.isna(current) else str(current)
                values_to_try = [v for v in observed if v != current_str][:20]

            seen = set()
            for new_value in values_to_try:
                key = str(new_value)
                if key in seen:
                    continue
                seen.add(key)
                scenario = dict(current_features)
                scenario[name] = new_value
                scenario_df = pd.DataFrame([scenario], columns=feature_names)
                try:
                    pred = model.predict(scenario_df)[0]
                    if run.task_type == "classification" and hasattr(model, "predict_proba"):
                        probs = model.predict_proba(scenario_df)[0]
                        classes = list(model.classes_)
                        desired_idx = next(i for i, c in enumerate(classes) if str(c) == str(desired_class))
                        score = float(probs[desired_idx])
                        improvement = score - baseline_score
                        scenario_value = pred.item() if hasattr(pred, "item") else pred
                        probability = float(probs[desired_idx])
                    else:
                        score = float(pred)
                        improvement = score - baseline_score
                        scenario_value = float(pred)
                        probability = None
                    if improvement <= 1e-8:
                        continue
                    candidates.append({
                        "feature": name,
                        "from": None if current is None or pd.isna(current) else (current.item() if hasattr(current, "item") else current),
                        "to": new_value.item() if hasattr(new_value, "item") else new_value,
                        "baseline_prediction": baseline_pred_value,
                        "recommended_prediction": scenario_value,
                        "improvement": round(float(improvement), 6),
                        "probability": round(probability, 6) if probability is not None else None,
                        "why": (
                            f"For these inputs, the trained {run.model_name} model predicts the target "
                            f"would move from {baseline_pred_value} to {scenario_value} when {name} changes "
                            f"from {current} to {new_value}. This is model evidence, not a causal guarantee."
                            if run.task_type != "classification" else
                            f"For these inputs, the trained {run.model_name} model predicts the probability of "
                            f"class {desired_class} would move from {baseline_score:.1%} to {probability:.1%} "
                            f"when {name} changes from {current} to {new_value}. This is model evidence, not a causal guarantee."
                        ),
                    })
                except Exception:
                    continue

        candidates.sort(key=lambda x: x["improvement"], reverse=True)
        # Keep the strongest recommendation per feature so the list is diverse.
        recommendations = []
        used_features = set()
        for item in candidates:
            if item["feature"] in used_features:
                continue
            used_features.add(item["feature"])
            recommendations.append(item)
            if len(recommendations) >= 5:
                break

        return {
            "model_id": run.id,
            "model_name": run.model_name,
            "target": run.target,
            "task_type": run.task_type,
            "baseline_prediction": baseline_pred_value,
            "applied_changes": applied_changes,
            "desired_class": desired_class,
            "baseline_probability": round(baseline_score, 6) if run.task_type == "classification" else None,
            "recommendations": [r for r in recommendations if _feature_actionability(r["feature"], df[r["feature"]])[0]],
            "actionable_only": True,
            "message": "Recommendations are generated from observed dataset values and real inference from the trained model; no feature-change rules or prediction values are hardcoded."
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Recommendation generation failed: {exc}")

@app.get("/api/history")
def list_prediction_history(user: User = Depends(current_user), session: Session = Depends(db)):
    rows = session.query(PredictionHistory).filter(PredictionHistory.user_id == user.id).order_by(PredictionHistory.created_at.desc()).all()
    return {"history": [{
        "id": h.id, "model_id": h.model_id, "dataset_id": h.dataset_id, "target": h.target,
        "task_type": h.task_type, "model_name": h.model_name,
        "prediction": json.loads(h.prediction_json or "{}"),
        "input": json.loads(h.input_json or "{}"),
        "has_explanation": bool(h.explanation_json and h.explanation_json != "{}"),
        "explanation": json.loads(h.explanation_json or "{}") if h.explanation_json and h.explanation_json != "{}" else None,
        "created_at": h.created_at.isoformat()
    } for h in rows]}

@app.delete("/api/history/{history_id}")
def delete_prediction_history(history_id: int, user: User = Depends(current_user), session: Session = Depends(db)):
    row = session.query(PredictionHistory).filter(PredictionHistory.id == history_id, PredictionHistory.user_id == user.id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Prediction history record not found")
    session.delete(row)
    session.commit()
    return {"message": "Prediction history deleted", "id": history_id}

@app.delete("/api/models/{model_id}")
def delete_model(model_id: int, user: User = Depends(current_user), session: Session = Depends(db)):
    run = session.query(ModelRun).filter(ModelRun.id == model_id, ModelRun.user_id == user.id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Model not found")
    history_rows = session.query(PredictionHistory).filter(PredictionHistory.model_id == run.id, PredictionHistory.user_id == user.id).all()
    for row in history_rows:
        session.delete(row)
    artifact = Path(run.artifact_path)
    session.delete(run)
    session.commit()
    try:
        if artifact.exists():
            artifact.unlink()
    except Exception:
        pass
    return {"message": "Model deleted", "id": model_id, "deleted_history": len(history_rows)}

@app.post("/api/models/{model_id}/predict")
def predict(model_id: int, data: PredictionRequest, user: User = Depends(current_user), session: Session = Depends(db)):
    run = session.query(ModelRun).filter(ModelRun.id == model_id, ModelRun.user_id == user.id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Model not found")
    if not Path(run.artifact_path).exists():
        raise HTTPException(status_code=404, detail="Trained model artifact is missing. Retrain the model.")
    dataset = session.query(Dataset).filter(Dataset.id == run.dataset_id, Dataset.user_id == user.id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    analysis = json.loads(dataset.analysis_json)
    feature_names = [c for c in analysis.get("column_names", []) if c != run.target]
    numeric = set(analysis.get("numerical_columns", []))
    schema = [{"name": n, "type": "number" if n in numeric else "category"} for n in feature_names]
    clean = _coerce_prediction_features(data.features or {}, schema)
    X = pd.DataFrame([clean], columns=feature_names)
    try:
        model = joblib.load(run.artifact_path)
        prediction = model.predict(X)[0]
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Prediction failed: {exc}")
    result = {
        "model_id": run.id, "model_name": run.model_name, "dataset_id": run.dataset_id,
        "dataset_name": dataset.name, "target": run.target, "task_type": run.task_type,
        "prediction": str(prediction) if run.task_type == "classification" else float(prediction),
        "input": clean
    }
    if run.task_type == "classification" and hasattr(model, "predict_proba"):
        try:
            probs = model.predict_proba(X)[0]
            classes = model.classes_
            result["probabilities"] = [{"class": str(cls), "probability": round(float(prob), 4)} for cls, prob in zip(classes, probs)]
            result["confidence"] = round(float(np.max(probs)), 4)
        except Exception:
            pass
    history = PredictionHistory(
        user_id=user.id, model_id=run.id, dataset_id=dataset.id, target=run.target,
        task_type=run.task_type, model_name=run.model_name,
        prediction_json=json.dumps(result, default=str), input_json=json.dumps(clean, default=str)
    )
    session.add(history)
    session.commit()
    session.refresh(history)
    result["history_id"] = history.id
    return result
