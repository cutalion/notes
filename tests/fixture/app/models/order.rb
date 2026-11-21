class Order
  STATUSES = %w[pending paid shipped refunded].freeze

  attr_reader :id, :status, :total_cents

  def initialize(id:, total_cents:)
    @id = id
    @status = 'pending'
    @total_cents = total_cents
  end

  def pay!
    raise ArgumentError, 'order is not pending' unless status == 'pending'

    @status = 'paid'
  end
end
