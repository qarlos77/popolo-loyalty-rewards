# -*- coding: utf-8 -*-
{
    'name': 'Loyalty Rewards API',
    'version': '19.0.3.0.0',
    'summary': 'REST API + WooCommerce sync + WhatsApp/Email notifications',
    'author': 'PopoloPizza',
    'depends': ['loyalty', 'point_of_sale', 'mail', 'base_setup'],
    'data': [
        'security/ir.model.access.csv',
        'views/res_config_settings_views.xml',
        'views/loyalty_sync_log_views.xml',
        'views/loyalty_birthday_views.xml',
        'data/cron_data.xml',
        'data/mail_template_data.xml',
    ],
    'installable': True,
    'license': 'LGPL-3',
}
