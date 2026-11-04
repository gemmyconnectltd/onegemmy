from app.modules.crm.service.activity import (
    count_activities,
    create_activity,
    delete_activity,
    list_activities,
    update_activity,
)
from app.modules.crm.service.campaign import (
    count_campaigns,
    create_campaign,
    delete_campaign,
    get_campaign,
    list_campaigns,
    update_campaign,
)
from app.modules.crm.service.email_log import (
    count_emails,
    create_email,
    delete_email,
    get_email,
    list_emails,
    update_email,
)

__all__ = [
    "count_activities",
    "count_campaigns",
    "count_emails",
    "create_activity",
    "create_campaign",
    "create_email",
    "delete_activity",
    "delete_campaign",
    "delete_email",
    "get_campaign",
    "get_email",
    "list_activities",
    "list_campaigns",
    "list_emails",
    "update_activity",
    "update_campaign",
    "update_email",
]
