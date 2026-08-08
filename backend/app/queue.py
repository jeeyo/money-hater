import procrastinate

from app.config import settings


def _make_connector() -> procrastinate.BaseConnector:
    return procrastinate.PsycopgConnector(conninfo=settings.queue_database_url)


queue_app = procrastinate.App(connector=_make_connector(), import_paths=["app.worker.tasks"])
