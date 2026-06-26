from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager

db = SQLAlchemy()

app = Flask(__name__)
app.config['SECRET_KEY'] = 'taskmanager123'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///database.db'

db.init_app(app)

login_manager = LoginManager()
login_manager.login_view = 'auth.login'
login_manager.init_app(app)

from models.user import User
from models.task import Task

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

from routes.auth import auth
from routes.task import task

app.register_blueprint(auth)
app.register_blueprint(task)

with app.app_context():
    db.create_all()

if __name__ == "__main__":
    app.run(debug=True)