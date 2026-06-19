# -*- coding: utf-8 -*-
{
    'name': 'Loyalty Rewards API',
    'version': '19.0.1.0.0',
    'summary': 'REST API + WhatsApp/Email notifications for the Loyalty Rewards web app',
    'author': 'PopoloPizza',
    'depends': ['loyalty', 'point_of_sale', 'mail', 'base_setup'],
    'data': [
        'security/ir.model.access.csv',
        'views/res_config_settings_views.xml',
        'data/mail_template_data.xml',
    ],
    'installable': True,
    'license': 'LGPL-3',
}
