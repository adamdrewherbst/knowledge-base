# -*- coding: utf-8 -*-
# this file is released under public domain and you can use without limitations

def index():
    """
    example action using the internationalization operator T and flash
    rendered by views/default/index.html or views/generic.html

    if you need a simple wiki simply replace the two lines below with:
    return auth.wiki()
    """
    return locals()


def about():
    return locals()


def paintings():

    import datetime

    records = []
    filters = {}
    match = {}

    if 'year' in request.vars:
        try:
            filters['year'] = int(request.vars['year'])
        except ValueError:
            pass
    elif len(request.args) > 0:
        filters['year'] = int(request.args(0))
    if 'text' in request.vars and request.vars['text'] is not None and len(request.vars['text']) > 0:
        filters['text'] = request.vars['text'].lower()

    date_fields = ['start_date', 'end_date']
    years = {}

    for painting in db(db.painting).iterselect(orderby=db.painting.end_date|db.painting.start_date):

        for field in date_fields:
            if painting[field] is not None:
                year = painting[field].year
                years[year] = True
                if 'year' in filters and year == filters['year']:
                        match['year'] = True

        if 'text' in filters:
            for field in painting:
                if isinstance(painting[field], str) and filters['text'] in painting[field].lower():
                    match['text'] = True

        full_match = True
        for key in filters:
            if key not in match or not match[key]:
                full_match = False
                break
        if full_match:
            records.append(painting)

    filter_form = FORM(
        DIV(LABEL('Year', _for='year'),
            SELECT('', *years.keys(), _name='year', value=str(filters['year']) if 'year' in filters else '', _class='form-control'),
            _class='form-group'),
        DIV(LABEL('Search Text', _for='text'),
            INPUT(_name='text', _placeholder='Search text...', _value=filters['text'] if 'text' in filters else '', _class='form-control',
                _size=40),
            _class='form-group'),
        DIV(INPUT(_type='submit', _class='btn btn-primary', _value='Apply Filters'),
            _class='form-group'),
        _class='filter-form'
        )
    if filter_form.accepts(request, session):
        pass
    else:
        pass

    is_filtered = 'year' in filters or 'text' in filters

    return dict(paintings=records, form=filter_form, filtered=is_filtered)


def painting():
    record = db.painting(request.args(0))
    return locals()


def painting_update():
    record = db.painting(request.args(0))
    is_update = record is not None
    form = SQLFORM(db.painting, record, deletable=True,
                  upload=URL('painting_download'))
    if form.process().accepted:
        if is_update:
            session.flash = 'Painting updated'
        redirect(URL('paintings', 'painting/' + str(form.vars.id)))
    elif form.errors:
        response.flash = 'Please fix all errors in the form'
    return dict(form=form)

def painting_download():
    return response.download(request, db)

def painting_delete():

    record = db.painting(request.args(0))

    year = None
    if record.start_date:
        year = record.start_date.year
    elif record.end_date:
        year = record.end_date.year

    record.delete_record()

    session.flash = 'Painting removed'
    if 'from_record' in request.vars and request.vars['from_record']:
        if year:
            redirect(URL('paintings', 'year/'+str(year)))
        else:
            redirect(URL('paintings', 'browse'))
    return dict()


def user():
    """
    exposes:
    http://..../[app]/default/user/login
    http://..../[app]/default/user/logout
    http://..../[app]/default/user/register
    http://..../[app]/default/user/profile
    http://..../[app]/default/user/retrieve_password
    http://..../[app]/default/user/change_password
    http://..../[app]/default/user/bulk_register
    use @auth.requires_login()
        @auth.requires_membership('group name')
        @auth.requires_permission('read','table name',record_id)
    to decorate functions that need access control
    also notice there is http://..../[app]/appadmin/manage/auth to allow administrator to manage users
    """
    return dict(form=auth())


@cache.action()
def download():
    """
    allows downloading of uploaded files
    http://..../[app]/default/download/[filename]
    """
    return response.download(request, db)


def call():
    """
    exposes services. for example:
    http://..../[app]/default/call/jsonrpc
    decorate with @services.jsonrpc the functions to expose
    supports xml, json, xmlrpc, jsonrpc, amfrpc, rss, csv
    """
    return service()


