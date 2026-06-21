# -*- coding: utf-8 -*-
{
    'name': 'Loyalty Rewards API',
    'version': '19.0.4.0.0',
    'summary': 'REST API + WooCommerce sync + WhatsApp/Email notifications',
    'author': 'PopoloPizza',
    'depends': ['loyalty', 'point_of_sale', 'pos_loyalty', 'mail', 'base_setup'],
    'data': [
        'security/ir.model.access.csv',
        'views/loyalty_home_menu.xml',
        'views/res_config_settings_views.xml',
        'views/loyalty_sync_log_views.xml',
        'views/loyalty_birthday_views.xml',
        'views/res_partner_views.xml',
        'data/cron_data.xml',
        'data/mail_template_data.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'loyalty_rewards_api/static/src/birthday_reward/birthday_reward.js',
            'loyalty_rewards_api/static/src/birthday_reward/loyalty_points_display.xml',
        ],
    },
    'installable': True,
    'license': 'LGPL-3',
}
