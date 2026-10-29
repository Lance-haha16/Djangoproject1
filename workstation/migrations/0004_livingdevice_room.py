from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("workstation", "0003_archiveentry"),
    ]

    operations = [
        migrations.AddField(
            model_name="livingdevice",
            name="room",
            field=models.CharField(
                blank=True,
                default="客厅",
                help_text="米家风格房间名",
                max_length=60,
            ),
        ),
    ]
