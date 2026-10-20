from rest_framework import serializers

COLUMN_KINDS = ["money", "count", "percent", "text", "date", "datetime", "reference"]


class ReportListItemSerializer(serializers.Serializer):
    key = serializers.CharField()
    title = serializers.CharField()
    description = serializers.CharField()
    uses_dates = serializers.BooleanField()


class ReportPeriodSerializer(serializers.Serializer):
    date_from = serializers.DateField()
    date_to = serializers.DateField()


class ReportOptionSerializer(serializers.Serializer):
    value = serializers.CharField()
    label = serializers.CharField()


class ReportFilterSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    options = ReportOptionSerializer(many=True)


class ReportMetricSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    value = serializers.IntegerField()
    kind = serializers.ChoiceField(choices=["money", "count"])


class ReportColumnSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    kind = serializers.ChoiceField(choices=COLUMN_KINDS)


class ReportTrendSerializer(serializers.Serializer):
    x = serializers.CharField()
    y = serializers.CharField()


class ReportDefinitionSerializer(serializers.Serializer):
    term = serializers.CharField()
    meaning = serializers.CharField()


class ReportSerializer(serializers.Serializer):
    """One report. `rows` are objects keyed by the columns' keys: money in integer paise, rates in basis
    points, dates as ISO strings. `period` is null for snapshot reports (stock)."""

    key = serializers.CharField()
    title = serializers.CharField()
    description = serializers.CharField()
    uses_dates = serializers.BooleanField()
    period = ReportPeriodSerializer(allow_null=True)
    generated_at = serializers.DateTimeField()
    filters = ReportFilterSerializer(many=True)
    applied = serializers.DictField(child=serializers.CharField())
    summary = ReportMetricSerializer(many=True)
    columns = ReportColumnSerializer(many=True)
    rows = serializers.ListField(child=serializers.DictField())
    trend = ReportTrendSerializer(allow_null=True)
    truncated = serializers.BooleanField()
    definitions = ReportDefinitionSerializer(many=True)
