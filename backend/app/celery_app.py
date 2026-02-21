from celery import Celery
from app.config import settings

def make_celery():
    celery_app = Celery(
        "fretbox_tasks",
        broker=settings.REDIS_URL,
        backend=settings.REDIS_URL,
        include=["app.tasks"]
    )
    
    celery_app.conf.update(
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        timezone="Asia/Kolkata",
        enable_utc=True,
    )
    
    return celery_app

celery = make_celery()
